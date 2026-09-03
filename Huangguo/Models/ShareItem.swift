import Foundation

struct ShareItem: Identifiable, Hashable {
    let id: String
    let name: String
    let kind: String
    let size: Int64
    let thumbnailLink: String?

    var isFolder: Bool { kind == "drive#folder" }

    var isVideo: Bool {
        let ext = (name as NSString).pathExtension.lowercased()
        return Self.videoExtensions.contains(ext)
    }

    static let videoExtensions: Set<String> = [
        "mp4", "mkv", "webm", "mov", "m4v", "avi", "ts", "flv", "wmv", "mpeg", "mpg"
    ]
}

struct Breadcrumb: Identifiable, Hashable {
    let id: String
    let name: String
}

struct ParsedShareLink: Equatable {
    let shareId: String
    let parentId: String
}

struct PendingDownload: Identifiable, Hashable {
    var id: String { fileId }
    let fileId: String
    let fileName: String
    let relativePath: String
    let expectedSize: Int64
}
