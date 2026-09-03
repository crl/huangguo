import SwiftUI

struct ContentView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        @Bindable var store = store
        VStack(spacing: 0) {
            TopBarView(store: store)
            Divider().opacity(0.35)
            HSplitView {
                ShareBrowserView(store: store)
                    .frame(minWidth: 540, minHeight: 460)
                DownloadQueueView(store: store)
                    .frame(minWidth: 360, idealWidth: 400, minHeight: 460)
            }
        }
        .fontDesign(.rounded)
        .background(Theme.canvas)
        .overlay {
            if let message = store.errorMessage {
                CuteAlert(title: "出错了", message: message) {
                    store.errorMessage = nil
                }
            }
        }
        .onAppear {
            store.downloads.preferTranscoding = store.preferTranscoding
        }
        .task {
            if store.items.isEmpty {
                await store.openShare()
            }
        }
    }
}
