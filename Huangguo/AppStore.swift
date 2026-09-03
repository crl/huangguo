import AppKit
import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class AppStore {
    var shareURL: String
    var sharePassword: String
    var saveDirectory: URL
    var isLoading = false
    var isScanning = false
    var statusText = ""
    var errorMessage: String?
    var items: [ShareItem] = []
    var breadcrumbs: [Breadcrumb] = []
    var selectedIDs: Set<String> = []
    var searchText = ""
    var preferTranscoding = false

    let client: PikPakShareClient
    let downloads: DownloadManager

    private var rootParentId = ""
    private var currentParentId = ""

    init() {
        let client = PikPakShareClient()
        self.client = client
        self.downloads = DownloadManager(client: client)
        self.shareURL = UserDefaults.standard.string(forKey: "shareURL")
            ?? "https://mypikpak.com/s/VP0D6es97vgNquS_avxUCiOIo2/ABEOncidTpkZZZFFWu0AE3mmo2_VOw"
        self.sharePassword = UserDefaults.standard.string(forKey: "sharePassword") ?? ""
        if let path = UserDefaults.standard.string(forKey: "saveDirectory") {
            self.saveDirectory = URL(fileURLWithPath: path)
        } else {
            self.saveDirectory = FileManager.default
                .urls(for: .moviesDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("PikPak", isDirectory: true)
        }
    }

    var filteredItems: [ShareItem] {
        let keyword = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !keyword.isEmpty else { return items }
        return items.filter { $0.name.localizedCaseInsensitiveContains(keyword) }
    }

    var selectedCount: Int { selectedIDs.count }

    var currentRelativePath: String {
        breadcrumbs.dropFirst().map(\.name).joined(separator: "/")
    }

    func persistSettings() {
        UserDefaults.standard.set(shareURL, forKey: "shareURL")
        UserDefaults.standard.set(sharePassword, forKey: "sharePassword")
        UserDefaults.standard.set(saveDirectory.path, forKey: "saveDirectory")
        downloads.preferTranscoding = preferTranscoding
    }

    func openShare() async {
        persistSettings()
        isLoading = true
        errorMessage = nil
        statusText = "正在打开分享…"
        do {
            let parsed = try ShareLinkParser.parse(shareURL)
            let opened = try await client.openShare(
                shareId: parsed.shareId,
                password: sharePassword,
                preferredParentId: parsed.parentId
            )
            rootParentId = opened.startParentId
            currentParentId = opened.startParentId
            breadcrumbs = [Breadcrumb(id: opened.startParentId, name: opened.title)]
            selectedIDs.removeAll()
            try await reloadCurrent()
            statusText = "已加载 \(items.count) 项"
        } catch {
            errorMessage = error.localizedDescription
            statusText = "打开失败"
        }
        isLoading = false
    }

    func enterFolder(_ item: ShareItem) async {
        guard item.isFolder else { return }
        isLoading = true
        errorMessage = nil
        breadcrumbs.append(Breadcrumb(id: item.id, name: item.name))
        currentParentId = item.id
        selectedIDs.removeAll()
        searchText = ""
        do {
            try await reloadCurrent()
            statusText = "已加载 \(items.count) 项"
        } catch {
            breadcrumbs.removeLast()
            currentParentId = breadcrumbs.last?.id ?? rootParentId
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func goToBreadcrumb(_ crumb: Breadcrumb) async {
        guard let index = breadcrumbs.firstIndex(of: crumb) else { return }
        breadcrumbs = Array(breadcrumbs.prefix(index + 1))
        currentParentId = crumb.id
        selectedIDs.removeAll()
        searchText = ""
        isLoading = true
        do {
            try await reloadCurrent()
            statusText = "已加载 \(items.count) 项"
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func toggleSelection(_ item: ShareItem) {
        if selectedIDs.contains(item.id) {
            selectedIDs.remove(item.id)
        } else {
            selectedIDs.insert(item.id)
        }
    }

    func selectAllVideosInCurrentFolder() {
        let videos = filteredItems.filter(\.isVideo).map(\.id)
        if videos.allSatisfy({ selectedIDs.contains($0) }) {
            videos.forEach { selectedIDs.remove($0) }
        } else {
            videos.forEach { selectedIDs.insert($0) }
        }
    }

    func selectAllCurrent() {
        let ids = filteredItems.map(\.id)
        if ids.allSatisfy({ selectedIDs.contains($0) }) {
            selectedIDs.removeAll()
        } else {
            selectedIDs.formUnion(ids)
        }
    }

    func downloadSelected() async {
        persistSettings()
        guard !selectedIDs.isEmpty else { return }
        isScanning = true
        errorMessage = nil
        statusText = "正在准备下载…"
        do {
            try FileManager.default.createDirectory(at: saveDirectory, withIntermediateDirectories: true)
            var pending: [PendingDownload] = []
            let currentPath = currentRelativePath
            for item in items where selectedIDs.contains(item.id) {
                let safeName = PathUtil.sanitize(item.name)
                if item.isFolder {
                    statusText = "正在扫描 \(item.name)…"
                    let nestedPath = currentPath.isEmpty ? safeName : (currentPath as NSString).appendingPathComponent(safeName)
                    let videos = try await client.collectVideos(folderId: item.id, pathPrefix: nestedPath)
                    pending.append(contentsOf: videos)
                } else {
                    pending.append(
                        PendingDownload(
                            fileId: item.id,
                            fileName: safeName,
                            relativePath: currentPath,
                            expectedSize: item.size
                        )
                    )
                }
            }
            downloads.preferTranscoding = preferTranscoding
            downloads.enqueue(pending, saveRoot: saveDirectory)
            statusText = "已加入 \(pending.count) 个文件"
            selectedIDs.removeAll()
        } catch {
            errorMessage = error.localizedDescription
            statusText = "准备下载失败"
        }
        isScanning = false
    }

    func chooseSaveDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "选择"
        panel.directoryURL = saveDirectory
        if panel.runModal() == .OK, let url = panel.url {
            saveDirectory = url
            persistSettings()
        }
    }

    private func reloadCurrent() async throws {
        items = try await client.list(parentId: currentParentId)
    }
}
