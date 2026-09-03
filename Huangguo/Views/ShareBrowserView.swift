import SwiftUI

struct ShareBrowserView: View {
    @Bindable var store: AppStore

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider().opacity(0.3)
            if store.filteredItems.isEmpty, !store.isLoading {
                CuteEmptyState(
                    title: store.items.isEmpty ? "还没有内容" : "没有匹配项",
                    systemImage: store.items.isEmpty ? "folder.fill" : "magnifyingglass",
                    message: store.items.isEmpty ? "粘贴分享链接，点一下打开就好" : "换个关键词再试试看"
                )
            } else {
                List {
                    ForEach(store.filteredItems) { item in
                        ShareRowView(
                            item: item,
                            isChecked: store.selectedIDs.contains(item.id)
                        ) {
                            store.toggleSelection(item)
                        }
                        .listRowInsets(EdgeInsets(top: 4, leading: 10, bottom: 4, trailing: 12))
                        .listRowSeparatorTint(Theme.hairline)
                        .listRowBackground(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(store.selectedIDs.contains(item.id) ? Theme.rose.opacity(0.10) : Color.clear)
                                .padding(.horizontal, 6)
                        )
                        .contentShape(Rectangle())
                        .onTapGesture(count: 2) {
                            if item.isFolder {
                                Task { await store.enterFolder(item) }
                            }
                        }
                        .contextMenu {
                            if item.isFolder {
                                Button("打开文件夹") {
                                    Task { await store.enterFolder(item) }
                                }
                            }
                            Button(store.selectedIDs.contains(item.id) ? "取消勾选" : "勾选") {
                                store.toggleSelection(item)
                            }
                        }
                    }
                }
                .listStyle(.inset)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Theme.panel)
        .overlay {
            if store.isLoading {
                VStack(spacing: 10) {
                    ProgressView()
                        .controlSize(.regular)
                        .tint(Theme.rose)
                    Text("加载中…")
                        .font(.callout.weight(.medium))
                        .foregroundStyle(Theme.roseDeep)
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 16)
                .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(Theme.rose.opacity(0.16), lineWidth: 1)
                }
                .shadow(color: Theme.rose.opacity(0.16), radius: 16, y: 6)
            }
        }
    }

    private var toolbar: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(Array(store.breadcrumbs.enumerated()), id: \.element.id) { index, crumb in
                        if index > 0 {
                            Image(systemName: "chevron.right")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.tertiary)
                        }
                        Button(crumb.name) {
                            Task { await store.goToBreadcrumb(crumb) }
                        }
                        .buttonStyle(.plain)
                        .font(.callout.weight(index == store.breadcrumbs.count - 1 ? .semibold : .regular))
                        .foregroundStyle(index == store.breadcrumbs.count - 1 ? Color.primary : Theme.rose)
                    }
                }
            }

            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("搜索当前目录", text: $store.searchText)
                        .textFieldStyle(.plain)
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 6)
                .background(Theme.canvas, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(Theme.hairline, lineWidth: 1)
                }

                Button("全选当前") {
                    store.selectAllCurrent()
                }
                .buttonStyle(QuietButtonStyle())

                Button("勾选视频") {
                    store.selectAllVideosInCurrentFolder()
                }
                .buttonStyle(QuietButtonStyle())

                Spacer()

                Text("已选 \(store.selectedCount) 项")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Button {
                    Task { await store.downloadSelected() }
                } label: {
                    Label("下载所选", systemImage: "arrow.down.circle.fill")
                }
                .buttonStyle(RoseButtonStyle())
                .disabled(store.selectedCount == 0 || store.isScanning || store.isLoading)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

struct ShareRowView: View {
    let item: ShareItem
    let isChecked: Bool
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onToggle) {
                CuteCheckbox(isOn: isChecked)
            }
            .buttonStyle(.plain)

            IconWell(systemName: iconName, color: iconColor)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .lineLimit(1)
                Text(item.isFolder ? "文件夹" : PathUtil.formatBytes(item.size))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if item.isFolder {
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 3)
    }

    private var iconName: String {
        if item.isFolder { return "folder.fill" }
        if item.isVideo { return "play.fill" }
        return "doc.fill"
    }

    private var iconColor: Color {
        if item.isFolder { return Theme.folder }
        if item.isVideo { return Theme.video }
        return Theme.file
    }
}
