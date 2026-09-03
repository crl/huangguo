import Foundation
import Observation

actor ConcurrencyGate {
    private let limit: Int
    private var running = 0
    private var waiters: [CheckedContinuation<Void, Never>] = []

    init(limit: Int) {
        self.limit = max(1, limit)
    }

    func acquire() async {
        while running >= limit {
            await withCheckedContinuation { continuation in
                waiters.append(continuation)
            }
        }
        running += 1
    }

    func release() {
        running = max(0, running - 1)
        if !waiters.isEmpty {
            waiters.removeFirst().resume()
        }
    }
}

enum MediaIntegrity {
    static func fileSize(at url: URL) -> Int64 {
        let value = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber
        return value?.int64Value ?? 0
    }

    /// Smallest byte offset the container claims to need. Nil if not MP4/MOV or unreadable.
    static func declaredEnd(at url: URL) -> Int64? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        let fileSize = fileSize(at: url)
        guard fileSize >= 8 else { return nil }

        var offset: Int64 = 0
        var sawMedia = false
        var declared: Int64 = 0
        for _ in 0..<32 {
            guard offset + 8 <= fileSize else { break }
            do {
                try handle.seek(toOffset: UInt64(offset))
                guard let header = try handle.read(upToCount: 8), header.count == 8 else { break }
                let boxSize = header.prefix(4).reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
                let type = String(bytes: header.suffix(4), encoding: .ascii) ?? ""
                var headerLen: Int64 = 8
                var real = Int64(boxSize)
                if boxSize == 1 {
                    guard let large = try handle.read(upToCount: 8), large.count == 8 else { break }
                    real = large.reduce(Int64(0)) { ($0 << 8) | Int64($1) }
                    headerLen = 16
                } else if boxSize == 0 {
                    real = fileSize - offset
                }
                if real < headerLen { return fileSize + 1 }
                declared = max(declared, offset + real)
                if type == "mdat" || type == "moov" { sawMedia = true }
                if real == 0 { break }
                offset += real
            } catch {
                break
            }
        }
        return sawMedia ? declared : nil
    }

    static func isComplete(at url: URL, expectedSize: Int64) -> Bool {
        guard FileManager.default.fileExists(atPath: url.path) else { return false }
        let size = fileSize(at: url)
        if size <= 0 { return false }
        if expectedSize > 1024, size < expectedSize { return false }
        if let declared = declaredEnd(at: url), size < declared { return false }
        return true
    }

    /// Header is intact enough for a player to open, even if mdat is truncated.
    static func isPlayable(at url: URL) -> Bool {
        let size = fileSize(at: url)
        guard size >= 64 * 1024 else { return false }
        if declaredEnd(at: url) != nil { return true }
        return size >= 1024 * 1024
    }
}

final class ResumableTransfer: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private let destination: URL
    private let expectedSize: Int64
    private let progressHandler: @Sendable (Int64, Int64) -> Void
    private let continuation: CheckedContinuation<Void, Error>
    private var handle: FileHandle?
    private var settled = false
    private var startedAt: Int64
    private var received: Int64
    var session: URLSession?
    var rangeHeader: String?

    init(
        destination: URL,
        startOffset: Int64,
        expectedSize: Int64,
        continuation: CheckedContinuation<Void, Error>,
        progressHandler: @escaping @Sendable (Int64, Int64) -> Void
    ) {
        self.destination = destination
        self.startedAt = startOffset
        self.received = startOffset
        self.expectedSize = expectedSize
        self.continuation = continuation
        self.progressHandler = progressHandler
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        guard let http = response as? HTTPURLResponse else {
            completionHandler(.cancel)
            finish(.failure(PikPakError.http(-1)))
            return
        }
        guard (200...206).contains(http.statusCode) else {
            completionHandler(.cancel)
            finish(.failure(PikPakError.http(http.statusCode)))
            return
        }

        do {
            let remoteSize = http.expectedContentLength
            if http.statusCode == 206 {
                if !FileManager.default.fileExists(atPath: destination.path) {
                    FileManager.default.createFile(atPath: destination.path, contents: nil)
                }
            } else if startedAt > 0 {
                // 服务器没按 Range 返回。只有确认这是完整更大文件时才覆盖，避免把续传进度清掉循环重下。
                let isFullFile = remoteSize > startedAt && (expectedSize <= 0 || remoteSize >= expectedSize)
                if !isFullFile {
                    completionHandler(.cancel)
                    finish(.failure(PikPakError.http(416)))
                    return
                }
                if FileManager.default.fileExists(atPath: destination.path) {
                    try FileManager.default.removeItem(at: destination)
                }
                FileManager.default.createFile(atPath: destination.path, contents: nil)
                startedAt = 0
                received = 0
            } else {
                if FileManager.default.fileExists(atPath: destination.path) {
                    try FileManager.default.removeItem(at: destination)
                }
                FileManager.default.createFile(atPath: destination.path, contents: nil)
                startedAt = 0
                received = 0
            }

            let handle = try FileHandle(forWritingTo: destination)
            if http.statusCode == 206 {
                try handle.seekToEnd()
            } else {
                try handle.truncate(atOffset: 0)
            }
            self.handle = handle

            let expected: Int64
            if http.statusCode == 206 {
                expected = startedAt + max(0, remoteSize)
            } else {
                expected = max(expectedSize, remoteSize)
            }
            progressHandler(received, expected)
            completionHandler(.allow)
        } catch {
            completionHandler(.cancel)
            finish(.failure(error))
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        do {
            try handle?.write(contentsOf: data)
            received += Int64(data.count)
            let expected = (dataTask.response as? HTTPURLResponse).map { http -> Int64 in
                if http.statusCode == 206 {
                    return startedAt + max(0, http.expectedContentLength)
                }
                return max(received, http.expectedContentLength)
            } ?? received
            progressHandler(received, expected)
        } catch {
            finish(.failure(error))
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        var redirected = request
        if let rangeHeader {
            redirected.setValue(rangeHeader, forHTTPHeaderField: "Range")
        }
        completionHandler(redirected)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        try? handle?.close()
        handle = nil
        if let error {
            finish(.failure(error))
        } else {
            finish(.success(()))
        }
    }

    private func finish(_ result: Result<Void, Error>) {
        guard !settled else { return }
        settled = true
        session?.finishTasksAndInvalidate()
        session = nil
        continuation.resume(with: result)
    }
}

enum FileTransfer {
    static func download(
        from remote: URL,
        to destination: URL,
        expectedSize: Int64,
        userAgent: String,
        onProgress: @escaping @Sendable (Int64, Int64) -> Void
    ) async throws {
        try FileManager.default.createDirectory(
            at: destination.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        let existing = MediaIntegrity.fileSize(at: destination)
        if existing > 0, MediaIntegrity.isComplete(at: destination, expectedSize: expectedSize) {
            onProgress(existing, max(existing, expectedSize))
            return
        }

        let offset = existing
        var request = URLRequest(url: remote)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("https://mypikpak.com/", forHTTPHeaderField: "Referer")
        if offset > 0 {
            request.setValue("bytes=\(offset)-", forHTTPHeaderField: "Range")
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let monitor = ResumableTransfer(
                destination: destination,
                startOffset: offset,
                expectedSize: expectedSize,
                continuation: continuation,
                progressHandler: onProgress
            )
            monitor.rangeHeader = request.value(forHTTPHeaderField: "Range")
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 120
            config.timeoutIntervalForResource = 60 * 60 * 6
            config.httpMaximumConnectionsPerHost = 4
            let session = URLSession(configuration: config, delegate: monitor, delegateQueue: nil)
            monitor.session = session
            session.dataTask(with: request).resume()
        }

        let finalSize = MediaIntegrity.fileSize(at: destination)
        let declared = MediaIntegrity.declaredEnd(at: destination) ?? 0
        let needed = max(expectedSize, declared)
        if needed > 1024, finalSize < needed {
            throw PikPakError.truncated(finalSize, needed)
        }
    }
}

@MainActor
@Observable
final class DownloadManager {
    private(set) var items: [DownloadItem] = []
    var preferTranscoding = false
    var maxConcurrent = 2

    private let client: PikPakShareClient
    private var workerTasks: [UUID: Task<Void, Never>] = [:]
    private let gate: ConcurrencyGate

    init(client: PikPakShareClient) {
        self.client = client
        self.gate = ConcurrencyGate(limit: 2)
    }

    var activeCount: Int {
        items.filter { $0.status == .downloading || $0.status == .resolving }.count
    }

    var queuedCount: Int {
        items.filter { $0.status == .queued }.count
    }

    func enqueue(_ pending: [PendingDownload], saveRoot: URL) {
        let existing = Set(items.filter { $0.status != .failed && $0.status != .cancelled && !$0.status.canPlay }.map(\.fileId))
        for file in pending {
            if let current = items.first(where: { $0.fileId == file.fileId }) {
                if current.status.canPlay {
                    let dest = (try? Self.makeDestination(item: current, saveRoot: saveRoot))
                    if let dest, MediaIntegrity.isPlayable(at: dest) {
                        continue
                    }
                    retry(current, saveRoot: saveRoot)
                    continue
                }
                if existing.contains(file.fileId) { continue }
            }
            let item = DownloadItem(
                fileId: file.fileId,
                fileName: file.fileName,
                relativePath: file.relativePath,
                expectedSize: file.expectedSize
            )
            items.insert(item, at: 0)
            start(item, saveRoot: saveRoot)
        }
    }

    func retry(_ item: DownloadItem, saveRoot: URL) {
        workerTasks[item.id]?.cancel()
        item.status = .queued
        item.errorMessage = nil
        item.bytesPerSecond = 0
        start(item, saveRoot: saveRoot)
    }

    func cancel(_ item: DownloadItem) {
        workerTasks[item.id]?.cancel()
        workerTasks[item.id] = nil
        if !item.status.canPlay {
            item.status = .cancelled
            item.errorMessage = "已取消"
        }
    }

    func cancelAll() {
        for item in items where !item.status.canPlay {
            cancel(item)
        }
    }

    func clearFinished() {
        items.removeAll { $0.status.isFinished }
    }

    private func start(_ item: DownloadItem, saveRoot: URL) {
        workerTasks[item.id]?.cancel()
        workerTasks[item.id] = Task { [weak self] in
            guard let self else { return }
            await self.gate.acquire()
            defer {
                Task { await self.gate.release() }
            }
            if Task.isCancelled {
                item.status = .cancelled
                return
            }
            await self.perform(item, saveRoot: saveRoot)
        }
    }

    private func perform(_ item: DownloadItem, saveRoot: URL) async {
        item.status = .resolving
        do {
            let ua = await client.currentUserAgent()
            if Task.isCancelled {
                item.status = .cancelled
                return
            }
            let destination = try Self.makeDestination(item: item, saveRoot: saveRoot)
            let existing = MediaIntegrity.fileSize(at: destination)
            if MediaIntegrity.isComplete(at: destination, expectedSize: item.expectedSize) {
                item.localURL = destination
                item.receivedBytes = existing
                item.totalBytes = max(existing, item.expectedSize)
                item.status = .completed
                return
            }
            item.status = .downloading
            item.receivedBytes = existing
            item.totalBytes = max(item.expectedSize, existing)

            var attempt = 0
            var delayNs: UInt64 = 400_000_000
            var lastError: Error = PikPakError.truncated(existing, item.expectedSize)
            var finished = false
            var lastSize = existing
            var stagnantRounds = 0
            while attempt < 6 {
                if Task.isCancelled { throw CancellationError() }
                let startedAt = Date()
                let startBytes = MediaIntegrity.fileSize(at: destination)
                do {
                    let remote = try await client.downloadURL(
                        fileId: item.fileId,
                        preferTranscoding: preferTranscoding
                    )
                    try await FileTransfer.download(
                        from: remote,
                        to: destination,
                        expectedSize: item.expectedSize,
                        userAgent: ua
                    ) { [weak item] written, expected in
                        Task { @MainActor in
                            guard let item else { return }
                            item.receivedBytes = written
                            if expected > 0 {
                                item.totalBytes = max(expected, item.expectedSize)
                            }
                            let elapsed = Date().timeIntervalSince(startedAt)
                            if elapsed > 0.25 {
                                item.bytesPerSecond = Double(max(0, written - startBytes)) / elapsed
                            }
                        }
                    }
                    finished = true
                    break
                } catch is CancellationError {
                    throw CancellationError()
                } catch {
                    lastError = error
                    attempt += 1
                    let now = MediaIntegrity.fileSize(at: destination)
                    if now > lastSize + 64 * 1024 {
                        lastSize = now
                        stagnantRounds = 0
                    } else {
                        stagnantRounds += 1
                    }
                    if stagnantRounds >= 2, MediaIntegrity.isPlayable(at: destination) {
                        break
                    }
                    if attempt >= 6 { break }
                    try await Task.sleep(nanoseconds: delayNs)
                    delayNs = min(delayNs * 2, 8_000_000_000)
                }
            }

            let finalSize = MediaIntegrity.fileSize(at: destination)
            item.receivedBytes = finalSize
            item.bytesPerSecond = 0
            item.localURL = destination
            if finished, MediaIntegrity.isComplete(at: destination, expectedSize: item.expectedSize) {
                item.status = .completed
                item.totalBytes = max(finalSize, item.expectedSize)
                item.errorMessage = nil
            } else if MediaIntegrity.isPlayable(at: destination) {
                item.status = .partial
                item.totalBytes = max(finalSize, item.expectedSize)
                item.errorMessage = "源站下不完，已保留 \(PathUtil.formatBytes(finalSize)) / \(PathUtil.formatBytes(max(item.expectedSize, finalSize)))，可先播放"
            } else {
                throw lastError
            }
        } catch is CancellationError {
            item.status = .cancelled
        } catch {
            item.status = .failed
            item.errorMessage = error.localizedDescription
            item.retryCount += 1
        }
        workerTasks[item.id] = nil
    }

    static func makeDestination(item: DownloadItem, saveRoot: URL) throws -> URL {
        let relative = item.relativePath
            .split(separator: "/")
            .map { PathUtil.sanitize(String($0)) }
            .joined(separator: "/")
        let folder = relative.isEmpty ? saveRoot : saveRoot.appendingPathComponent(relative, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appendingPathComponent(PathUtil.sanitize(item.fileName))
    }
}
