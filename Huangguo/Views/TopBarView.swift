import AppKit
import SwiftUI

struct TopBarView: View {
    @Bindable var store: AppStore

    var body: some View {
        VStack(spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                Color.clear
                    .frame(width: 62, height: 12)
                    .contentShape(Rectangle())

                BrandMark()

                VStack(alignment: .leading, spacing: 1) {
                    Text("黄果下载")
                        .font(.headline.weight(.semibold))
                    Text(store.statusText.isEmpty ? "PikPak 分享下载" : store.statusText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 16)

                if store.isLoading || store.isScanning {
                    ProgressView()
                        .controlSize(.small)
                        .tint(Theme.rose)
                }
            }

            HStack(spacing: 8) {
                labeledField(systemImage: "link") {
                    TextField("粘贴 mypikpak.com/s/… 分享链接", text: $store.shareURL)
                        .textFieldStyle(.plain)
                        .onSubmit { Task { await store.openShare() } }
                }

                labeledField(systemImage: "key.fill") {
                    SecureField("密码", text: $store.sharePassword)
                        .textFieldStyle(.plain)
                }
                .frame(width: 124)

                Button("打开") {
                    Task { await store.openShare() }
                }
                .buttonStyle(RoseButtonStyle())
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(store.isLoading || store.shareURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            HStack(spacing: 10) {
                Button {
                    store.chooseSaveDirectory()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "folder.fill")
                            .foregroundStyle(Theme.folder)
                        Text(store.saveDirectory.path)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.down")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    .font(.caption)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Theme.field, in: Capsule())
                    .overlay {
                        Capsule().strokeBorder(Theme.hairline, lineWidth: 1)
                    }
                }
                .buttonStyle(.plain)
                .help(store.saveDirectory.path)

                Toggle(isOn: $store.preferTranscoding) {
                    Text("优先转码")
                        .font(.caption)
                }
                .toggleStyle(.switch)
                .controlSize(.mini)
                .tint(Theme.rose)
                .help("更稳但清晰度可能更低")
                .onChange(of: store.preferTranscoding) { _, value in
                    store.downloads.preferTranscoding = value
                }

                Spacer()
            }
        }
        .padding(.top, 8)
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
        .background(Theme.headerWash)
        .background(WindowMover())
    }

    private func labeledField<Content: View>(systemImage: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.callout)
                .foregroundStyle(Theme.rose.opacity(0.85))
                .frame(width: 16)
            content()
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 8)
        .background(Theme.field, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Theme.rose.opacity(0.16), lineWidth: 1)
        }
    }
}

private struct WindowMover: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        WindowMoveView()
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

private final class WindowMoveView: NSView {
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        window?.isMovableByWindowBackground = true
        window?.titlebarAppearsTransparent = true
    }

    override var mouseDownCanMoveWindow: Bool { true }
}
