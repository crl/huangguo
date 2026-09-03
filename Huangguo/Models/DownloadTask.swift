import Foundation
import Observation

enum DownloadStatus: String, Equatable {
    case queued
    case resolving
    case downloading
    case completed
    case partial
    case failed
    case cancelled

    var isFinished: Bool {
        self == .completed || self == .partial || self == .cancelled
    }

    var canPlay: Bool {
        self == .completed || self == .partial
    }
}

@Observable
final class DownloadItem: Identifiable {
    let id: UUID
    let fileId: String
    let fileName: String
    let relativePath: String
    let expectedSize: Int64

    var status: DownloadStatus
    var receivedBytes: Int64
    var totalBytes: Int64
    var bytesPerSecond: Double
    var errorMessage: String?
    var localURL: URL?
    var retryCount: Int

    init(
        fileId: String,
        fileName: String,
        relativePath: String,
        expectedSize: Int64
    ) {
        self.id = UUID()
        self.fileId = fileId
        self.fileName = fileName
        self.relativePath = relativePath
        self.expectedSize = expectedSize
        self.status = .queued
        self.receivedBytes = 0
        self.totalBytes = expectedSize
        self.bytesPerSecond = 0
        self.retryCount = 0
    }

    var progress: Double {
        let total = max(totalBytes, 1)
        return min(1, Double(receivedBytes) / Double(total))
    }

    var destinationRelativePath: String {
        if relativePath.isEmpty {
            return fileName
        }
        return (relativePath as NSString).appendingPathComponent(fileName)
    }
}
