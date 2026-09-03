import AppKit
import SwiftUI

enum Theme {
    static let rose = Color(red: 1.00, green: 0.47, blue: 0.62)
    static let roseDeep = Color(red: 0.86, green: 0.32, blue: 0.48)
    static let blush = Color(red: 1.00, green: 0.86, blue: 0.89)
    static let peach = Color(red: 1.00, green: 0.72, blue: 0.62)
    static let folder = Color(red: 1.00, green: 0.70, blue: 0.46)
    static let video = Color(red: 1.00, green: 0.47, blue: 0.62)
    static let file = Color(red: 0.82, green: 0.68, blue: 0.74)
    static let success = Color(red: 0.36, green: 0.70, blue: 0.56)
    static let warning = Color(red: 0.93, green: 0.62, blue: 0.36)
    static let danger = Color(red: 0.92, green: 0.36, blue: 0.48)

    static var canvas: Color {
        Color(nsColor: NSColor(name: "ThemeCanvas") { appearance in
            if appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua {
                return NSColor(srgbRed: 0.16, green: 0.10, blue: 0.13, alpha: 1)
            }
            return NSColor(srgbRed: 1.00, green: 0.945, blue: 0.952, alpha: 1)
        })
    }

    static var panel: Color {
        Color(nsColor: NSColor(name: "ThemePanel") { appearance in
            if appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua {
                return NSColor(srgbRed: 0.20, green: 0.13, blue: 0.16, alpha: 1)
            }
            return NSColor(srgbRed: 1.00, green: 0.975, blue: 0.978, alpha: 1)
        })
    }

    static var field: Color {
        Color(nsColor: NSColor(name: "ThemeField") { appearance in
            if appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua {
                return NSColor(srgbRed: 0.22, green: 0.16, blue: 0.18, alpha: 1)
            }
            return NSColor.white
        })
    }

    static var hairline: Color {
        Color.primary.opacity(0.08)
    }

    static var roseGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 1.00, green: 0.62, blue: 0.72),
                Color(red: 0.96, green: 0.38, blue: 0.56)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    static var headerWash: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 1.00, green: 0.78, blue: 0.84),
                Color(red: 1.00, green: 0.90, blue: 0.92),
                Color(red: 1.00, green: 0.95, blue: 0.96)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

struct IconWell: View {
    let systemName: String
    let color: Color
    var size: CGFloat = 28

    var body: some View {
        Circle()
            .fill(color.opacity(0.16))
            .frame(width: size, height: size)
            .overlay {
                Image(systemName: systemName)
                    .font(.system(size: size * 0.42, weight: .semibold, design: .rounded))
                    .foregroundStyle(color)
            }
    }
}

struct StatusPill: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption2.weight(.medium))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12), in: Capsule())
    }
}

struct BlossomProgress: View {
    var value: Double

    var body: some View {
        GeometryReader { geo in
            Capsule()
                .fill(Theme.rose.opacity(0.12))
            Capsule()
                .fill(Theme.roseGradient)
                .frame(width: max(6, geo.size.width * min(1, max(0, value))))
        }
        .frame(height: 5)
    }
}

struct BrandMark: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Theme.roseGradient)
            Image(systemName: "play.fill")
                .font(.system(size: 11, weight: .black))
                .foregroundStyle(.white)
                .offset(x: 0.5)
        }
        .frame(width: 26, height: 26)
        .shadow(color: Theme.rose.opacity(0.28), radius: 5, y: 1)
    }
}

struct CuteEmptyState: View {
    let title: String
    let systemImage: String
    let message: String

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [Theme.blush, Theme.rose.opacity(0.18)],
                            center: .center,
                            startRadius: 6,
                            endRadius: 40
                        )
                    )
                    .frame(width: 72, height: 72)
                Image(systemName: systemImage)
                    .font(.system(size: 28, weight: .medium, design: .rounded))
                    .foregroundStyle(Theme.rose)
            }
            VStack(spacing: 5) {
                Text(title)
                    .font(.headline)
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(28)
    }
}

struct CuteAlert: View {
    let title: String
    let message: String
    var actionTitle: String = "好"
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.16)
                .ignoresSafeArea()
                .onTapGesture(perform: onDismiss)

            VStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Theme.rose.opacity(0.12))
                        .frame(width: 56, height: 56)
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 30, weight: .medium, design: .rounded))
                        .foregroundStyle(Theme.rose)
                }

                VStack(spacing: 6) {
                    Text(title)
                        .font(.title3.weight(.semibold))
                    Text(message)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 280)
                }

                Button(actionTitle, action: onDismiss)
                    .buttonStyle(RoseButtonStyle())
                    .padding(.top, 2)
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 24)
            .background(Theme.panel, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(Theme.rose.opacity(0.18), lineWidth: 1)
            }
            .shadow(color: Theme.rose.opacity(0.22), radius: 28, y: 10)
        }
    }
}

struct CuteCheckbox: View {
    let isOn: Bool

    var body: some View {
        Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
            .font(.system(size: 18, weight: .semibold, design: .rounded))
            .foregroundStyle(isOn ? Theme.rose : Color.secondary.opacity(0.55))
            .frame(width: 22, height: 22)
    }
}

struct RoseButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.semibold))
            .foregroundStyle(.white.opacity(isEnabled ? 1 : 0.75))
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(
                Capsule().fill(
                    isEnabled
                        ? Theme.rose.opacity(configuration.isPressed ? 0.82 : 1)
                        : Theme.rose.opacity(0.38)
                )
            )
    }
}

struct QuietButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.medium))
            .foregroundStyle(Theme.roseDeep.opacity(isEnabled ? 1 : 0.45))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule().fill(Theme.rose.opacity(isEnabled ? (configuration.isPressed ? 0.22 : 0.15) : 0.08))
            )
    }
}
