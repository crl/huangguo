import Foundation

enum PikPakError: LocalizedError {
    case invalidURL
    case captchaFailed(String)
    case api(Int, String)
    case shareStatus(String)
    case noDownloadURL
    case http(Int)
    case truncated(Int64, Int64)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "不是合法的 PikPak 分享链接"
        case .captchaFailed(let message):
            return "验证初始化失败：\(message)"
        case .api(let code, let message):
            return "PikPak 接口错误 \(code)：\(message)"
        case .shareStatus(let text):
            return text
        case .noDownloadURL:
            return "没有拿到下载地址（该文件可能不是可直链视频）"
        case .http(let code):
            if code == 416 {
                return "这条下载链接无法续传，正在换新地址接着下"
            }
            return "HTTP \(code)"
        case .truncated(let got, let expected):
            return "源站下不完（\(PathUtil.formatBytes(got)) / \(PathUtil.formatBytes(expected))）"
        case .cancelled:
            return "已取消"
        }
    }
}

struct ShareAPIResponse: Decodable {
    var shareStatus: String?
    var shareStatusText: String?
    var fileInfo: ShareFileDTO?
    var files: [ShareFileDTO]?
    var nextPageToken: String?
    var passCodeToken: String?
    var title: String?
    var errorCode: Int?
    var error: String?
    var errorDescription: String?

    enum CodingKeys: String, CodingKey {
        case shareStatus = "share_status"
        case shareStatusText = "share_status_text"
        case fileInfo = "file_info"
        case files
        case nextPageToken = "next_page_token"
        case passCodeToken = "pass_code_token"
        case title
        case errorCode = "error_code"
        case error
        case errorDescription = "error_description"
    }
}

struct OpenedShare {
    var shareId: String
    var startParentId: String
    var title: String
}

struct ShareFileDTO: Decodable {
    var id: String?
    var kind: String?
    var name: String?
    var size: FlexibleString?
    var thumbnailLink: String?
    var webContentLink: String?
    var medias: [ShareMediaDTO]?

    enum CodingKeys: String, CodingKey {
        case id, kind, name, size
        case thumbnailLink = "thumbnail_link"
        case webContentLink = "web_content_link"
        case medias
    }

    func asItem() -> ShareItem? {
        guard let id, let name else { return nil }
        return ShareItem(
            id: id,
            name: name,
            kind: kind ?? "drive#file",
            size: size?.int64Value ?? 0,
            thumbnailLink: thumbnailLink
        )
    }
}

struct ShareMediaDTO: Decodable {
    var link: ShareMediaLink?
    var isOrigin: Bool?
    var resolutionName: String?

    enum CodingKeys: String, CodingKey {
        case link
        case isOrigin = "is_origin"
        case resolutionName = "resolution_name"
    }
}

struct ShareMediaLink: Decodable {
    var url: String?
}

struct FlexibleString: Decodable {
    let value: String

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let number = try? container.decode(Int64.self) {
            value = String(number)
        } else if let string = try? container.decode(String.self) {
            value = string
        } else {
            value = "0"
        }
    }

    var int64Value: Int64 { Int64(value) ?? 0 }
}

struct CaptchaInitResponse: Decodable {
    var captchaToken: String?
    var url: String?
    var errorCode: Int?
    var error: String?
    var errorDescription: String?

    enum CodingKeys: String, CodingKey {
        case captchaToken = "captcha_token"
        case url
        case errorCode = "error_code"
        case error
        case errorDescription = "error_description"
    }
}

actor PikPakShareClient {
    private let session: URLSession
    private var profile: PikPakClientProfile
    private var deviceID: String
    private var captchaToken = ""
    private var passCodeToken = ""
    private var shareId = ""
    private var driveHost = "api-drive.mypikpak.com"
    private var userHost = "user.mypikpak.com"
    private(set) var userAgent = ""

    init() {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.httpMaximumConnectionsPerHost = 4
        self.session = URLSession(configuration: config)
        self.profile = .android
        self.deviceID = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        self.userAgent = PikPakCrypto.androidUserAgent(deviceID: deviceID, profile: profile)
    }

    func openShare(shareId: String, password: String, preferredParentId: String) async throws -> OpenedShare {
        self.shareId = shareId
        self.passCodeToken = ""
        self.captchaToken = ""
        self.deviceID = Self.persistentDeviceID(for: shareId)
        try await bootstrapCaptcha()
        let info = try await getShareInfo(passCode: password)
        if let token = info.passCodeToken, !token.isEmpty {
            passCodeToken = token
        }

        let shareTitle = info.title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let roots = info.files ?? []

        if !preferredParentId.isEmpty, await isValidFolder(preferredParentId) {
            return OpenedShare(
                shareId: shareId,
                startParentId: preferredParentId,
                title: (shareTitle?.isEmpty == false) ? shareTitle! : "分享"
            )
        }

        if roots.count == 1,
           roots.first?.kind == "drive#folder",
           let folderId = roots.first?.id {
            return OpenedShare(
                shareId: shareId,
                startParentId: folderId,
                title: roots.first?.name ?? shareTitle ?? "分享"
            )
        }

        return OpenedShare(
            shareId: shareId,
            startParentId: "",
            title: (shareTitle?.isEmpty == false) ? shareTitle! : "分享"
        )
    }

    private func isValidFolder(_ parentId: String) async -> Bool {
        do {
            _ = try await getShareDetail(parentId: parentId, pageToken: "")
            return true
        } catch PikPakError.api(let code, _) where code == 5 {
            return false
        } catch {
            return false
        }
    }

    func list(parentId: String) async throws -> [ShareItem] {
        var items: [ShareItem] = []
        var pageToken = ""
        repeat {
            let response = try await getShareDetail(parentId: parentId, pageToken: pageToken)
            if let status = response.shareStatus, status != "OK", !status.isEmpty {
                if status == "PASS_CODE_EMPTY" || status == "PASS_CODE_ERROR" {
                    let info = try await getShareInfo(passCode: "")
                    passCodeToken = info.passCodeToken ?? ""
                    if status == "PASS_CODE_ERROR" {
                        throw PikPakError.shareStatus(response.shareStatusText ?? "分享密码错误")
                    }
                    continue
                }
                throw PikPakError.shareStatus(response.shareStatusText ?? status)
            }
            let files = response.files ?? []
            items.append(contentsOf: files.compactMap { $0.asItem() })
            pageToken = response.nextPageToken ?? ""
        } while !pageToken.isEmpty
        return items
    }

    func collectVideos(folderId: String, pathPrefix: String) async throws -> [PendingDownload] {
        let listing = try await list(parentId: folderId)
        var result: [PendingDownload] = []
        for item in listing {
            let safeName = PathUtil.sanitize(item.name)
            if item.isFolder {
                let nestedPath = pathPrefix.isEmpty ? safeName : (pathPrefix as NSString).appendingPathComponent(safeName)
                let children = try await collectVideos(folderId: item.id, pathPrefix: nestedPath)
                result.append(contentsOf: children)
            } else if item.isVideo {
                result.append(
                    PendingDownload(
                        fileId: item.id,
                        fileName: safeName,
                        relativePath: pathPrefix,
                        expectedSize: item.size
                    )
                )
            }
        }
        return result
    }

    func downloadURL(fileId: String, preferTranscoding: Bool) async throws -> URL {
        let response = try await getFileInfo(fileId: fileId)
        let info = response.fileInfo
        let direct = info?.webContentLink ?? ""
        let medias = info?.medias ?? []

        var candidate = ""
        if preferTranscoding, medias.count > 1, let url = medias[1].link?.url, !url.isEmpty {
            candidate = url
        } else if !direct.isEmpty {
            candidate = direct
        } else if let origin = medias.first(where: { $0.isOrigin == true })?.link?.url, !origin.isEmpty {
            candidate = origin
        } else if let url = medias.first?.link?.url, !url.isEmpty {
            candidate = url
        }

        guard let url = URL(string: candidate), !candidate.isEmpty else {
            throw PikPakError.noDownloadURL
        }
        return url
    }

    func currentUserAgent() -> String { userAgent }

    private func bootstrapCaptcha() async throws {
        var lastError: Error?
        let hosts: [(drive: String, user: String)] = [
            ("api-drive.mypikpak.com", "user.mypikpak.com"),
            ("api-drive.mypikpak.net", "user.mypikpak.net"),
        ]
        let profiles: [PikPakClientProfile] = [.android, .pc, .web]
        for hostPair in hosts {
            driveHost = hostPair.drive
            userHost = hostPair.user
            for next in profiles {
                apply(profile: next)
                do {
                    try await refreshCaptcha(action: "GET:/drive/v1/share")
                    return
                } catch {
                    lastError = error
                }
            }
        }
        throw lastError ?? PikPakError.captchaFailed("无法初始化")
    }

    private func apply(profile: PikPakClientProfile) {
        self.profile = profile
        if let ua = profile.staticUserAgent {
            userAgent = ua
        } else {
            userAgent = PikPakCrypto.androidUserAgent(deviceID: deviceID, profile: profile)
        }
    }

    private func refreshCaptcha(action: String) async throws {
        let timestamp = String(Int(Date().timeIntervalSince1970 * 1000))
        let sign = PikPakCrypto.captchaSign(profile: profile, deviceID: deviceID, timestamp: timestamp)
        let body: [String: Any] = [
            "action": action,
            "captcha_token": captchaToken,
            "client_id": profile.clientID,
            "device_id": deviceID,
            "meta": [
                "captcha_sign": sign,
                "client_version": profile.clientVersion,
                "package_name": profile.packageName,
                "timestamp": timestamp,
                "user_id": "",
            ],
            "redirect_uri": "",
        ]
        let data = try JSONSerialization.data(withJSONObject: body, options: [])
        var request = URLRequest(url: URL(string: "https://\(userHost)/v1/shield/captcha/init")!)
        request.httpMethod = "POST"
        request.httpBody = data
        applyHeaders(to: &request)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (responseData, http) = try await send(request)
        let decoded = try JSONDecoder().decode(CaptchaInitResponse.self, from: responseData)
        if let code = decoded.errorCode, code != 0 {
            throw PikPakError.captchaFailed(decoded.errorDescription ?? decoded.error ?? "HTTP \(http.statusCode)")
        }
        guard let token = decoded.captchaToken, !token.isEmpty else {
            throw PikPakError.captchaFailed(decoded.errorDescription ?? decoded.url ?? "未返回 captcha_token")
        }
        captchaToken = token
    }

    private func getShareInfo(passCode: String) async throws -> ShareAPIResponse {
        try await apiGET(
            path: "/drive/v1/share",
            query: [
                "share_id": shareId,
                "pass_code": passCode,
                "thumbnail_size": "SIZE_LARGE",
                "limit": "100",
            ]
        )
    }

    private func getShareDetail(parentId: String, pageToken: String) async throws -> ShareAPIResponse {
        try await apiGET(
            path: "/drive/v1/share/detail",
            query: [
                "parent_id": parentId,
                "share_id": shareId,
                "thumbnail_size": "SIZE_LARGE",
                "with_audit": "true",
                "limit": "100",
                "filters": #"{"phase":{"eq":"PHASE_TYPE_COMPLETE"},"trashed":{"eq":false}}"#,
                "page_token": pageToken,
                "pass_code_token": passCodeToken,
            ]
        )
    }

    private func getFileInfo(fileId: String) async throws -> ShareAPIResponse {
        try await apiGET(
            path: "/drive/v1/share/file_info",
            query: [
                "share_id": shareId,
                "file_id": fileId,
                "pass_code_token": passCodeToken,
            ]
        )
    }

    private func apiGET(path: String, query: [String: String]) async throws -> ShareAPIResponse {
        let action = "GET:" + path
        func makeRequest() throws -> URLRequest {
            var components = URLComponents(string: "https://\(driveHost)\(path)")!
            components.queryItems = query
                .filter { !$0.value.isEmpty || $0.key == "parent_id" || $0.key == "page_token" || $0.key == "pass_code" }
                .map { URLQueryItem(name: $0.key, value: $0.value) }
            guard let url = components.url else { throw PikPakError.invalidURL }
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            applyHeaders(to: &request)
            return request
        }

        if captchaToken.isEmpty {
            try await refreshCaptcha(action: action)
        }

        var request = try makeRequest()
        var (data, _) = try await send(request)
        var decoded = try JSONDecoder().decode(ShareAPIResponse.self, from: data)
        if decoded.errorCode == 9 {
            try await refreshCaptcha(action: action)
            request = try makeRequest()
            (data, _) = try await send(request)
            decoded = try JSONDecoder().decode(ShareAPIResponse.self, from: data)
        }
        if let code = decoded.errorCode, code != 0 {
            throw PikPakError.api(code, decoded.errorDescription ?? decoded.error ?? "未知错误")
        }
        return decoded
    }

    private func applyHeaders(to request: inout URLRequest) {
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue(profile.clientID, forHTTPHeaderField: "X-Client-ID")
        request.setValue(deviceID, forHTTPHeaderField: "X-Device-ID")
        request.setValue(captchaToken, forHTTPHeaderField: "X-Captcha-Token")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
    }

    private func send(_ request: URLRequest, retry: Int = 5) async throws -> (Data, HTTPURLResponse) {
        var attempt = 0
        var delayNs: UInt64 = 400_000_000
        var lastError: Error = PikPakError.http(-1)
        while attempt <= retry {
            do {
                let (data, response) = try await session.data(for: request)
                guard let http = response as? HTTPURLResponse else {
                    throw PikPakError.http(-1)
                }
                if http.statusCode == 429 || (500...599).contains(http.statusCode) {
                    lastError = PikPakError.http(http.statusCode)
                    attempt += 1
                    if attempt > retry { break }
                    try await Task.sleep(nanoseconds: delayNs)
                    delayNs = min(delayNs * 2, 8_000_000_000)
                    continue
                }
                return (data, http)
            } catch is CancellationError {
                throw PikPakError.cancelled
            } catch {
                lastError = error
                attempt += 1
                if attempt > retry { break }
                try await Task.sleep(nanoseconds: delayNs)
                delayNs = min(delayNs * 2, 8_000_000_000)
            }
        }
        throw lastError
    }

    private static func persistentDeviceID(for shareId: String) -> String {
        let key = "pikpak.device.\(shareId)"
        if let existing = UserDefaults.standard.string(forKey: key), existing.count == 32 {
            return existing
        }
        let generated = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        UserDefaults.standard.set(generated, forKey: key)
        return generated
    }
}
