import CryptoKit
import Foundation

enum PikPakPlatform: String, CaseIterable {
    case android
    case pc
    case web
}

struct PikPakClientProfile {
    let platform: PikPakPlatform
    let clientID: String
    let clientSecret: String
    let clientVersion: String
    let packageName: String
    let sdkVersion: String
    let algorithms: [String]
    let staticUserAgent: String?

    static let android = PikPakClientProfile(
        platform: .android,
        clientID: "YNxT9w7GMdWvEOKa",
        clientSecret: "dbw2OtmVEeuUvIptb1Coyg",
        clientVersion: "1.53.2",
        packageName: "com.pikcloud.pikpak",
        sdkVersion: "2.0.6.206003",
        algorithms: [
            "SOP04dGzk0TNO7t7t9ekDbAmx+eq0OI1ovEx",
            "nVBjhYiND4hZ2NCGyV5beamIr7k6ifAsAbl",
            "Ddjpt5B/Cit6EDq2a6cXgxY9lkEIOw4yC1GDF28KrA",
            "VVCogcmSNIVvgV6U+AochorydiSymi68YVNGiz",
            "u5ujk5sM62gpJOsB/1Gu/zsfgfZO",
            "dXYIiBOAHZgzSruaQ2Nhrqc2im",
            "z5jUTBSIpBN9g4qSJGlidNAutX6",
            "KJE2oveZ34du/g1tiimm",
        ],
        staticUserAgent: nil
    )

    static let pc = PikPakClientProfile(
        platform: .pc,
        clientID: "YvtoWO6GNHiuCl7x",
        clientSecret: "1NIH5R1IEe2pAxZE3hv3uA",
        clientVersion: "undefined",
        packageName: "mypikpak.com",
        sdkVersion: "8.0.3",
        algorithms: [
            "KHBJ07an7ROXDoK7Db",
            "G6n399rSWkl7WcQmw5rpQInurc1DkLmLJqE",
            "JZD1A3M4x+jBFN62hkr7VDhkkZxb9g3rWqRZqFAAb",
            "fQnw/AmSlbbI91Ik15gpddGgyU7U",
            "/Dv9JdPYSj3sHiWjouR95NTQff",
            "yGx2zuTjbWENZqecNI+edrQgqmZKP",
            "ljrbSzdHLwbqcRn",
            "lSHAsqCkGDGxQqqwrVu",
            "TsWXI81fD1",
            "vk7hBjawK/rOSrSWajtbMk95nfgf3",
        ],
        staticUserAgent: "MainWindow Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) PikPak/2.6.11.4955 Chrome/100.0.4896.160 Electron/18.3.15 Safari/537.36"
    )

    static let web = PikPakClientProfile(
        platform: .web,
        clientID: "YUMx5nI8ZU8Ap8pm",
        clientSecret: "dbw2OtmVEeuUvIptb1Coyg",
        clientVersion: "2.0.0",
        packageName: "mypikpak.com",
        sdkVersion: "8.0.3",
        algorithms: [
            "C9qPpZLN8ucRTaTiUMWYS9cQvWOE",
            "+r6CQVxjzJV6LCV",
            "F",
            "pFJRC",
            "9WXYIDGrwTCz2OiVlgZa90qpECPD6olt",
            "/750aCr4lm/Sly/c",
            "RB+DT/gZCrbV",
            "",
            "CyLsf7hdkIRxRm215hl",
            "7xHvLi2tOYP0Y92b",
            "ZGTXXxu8E/MIWaEDB+Sm/",
            "1UI3",
            "E7fP5Pfijd+7K+t6Tg/NhuLq0eEUVChpJSkrKxpO",
            "ihtqpG6FMt65+Xk+tWUH2",
            "NhXXU9rg4XXdzo7u5o",
        ],
        staticUserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
    )
}

enum PikPakCrypto {
    static func md5Hex(_ string: String) -> String {
        hex(Insecure.MD5.hash(data: Data(string.utf8)))
    }

    static func sha1Hex(_ string: String) -> String {
        hex(Insecure.SHA1.hash(data: Data(string.utf8)))
    }

    private static func hex<D: Sequence>(_ digest: D) -> String where D.Element == UInt8 {
        digest.map { String(format: "%02x", $0) }.joined()
    }

    static func captchaSign(profile: PikPakClientProfile, deviceID: String, timestamp: String) -> String {
        var value = profile.clientID + profile.clientVersion + profile.packageName + deviceID + timestamp
        for salt in profile.algorithms {
            value = md5Hex(value + salt)
        }
        return "1." + value
    }

    static func deviceSign(deviceID: String, packageName: String) -> String {
        let sha1 = sha1Hex(deviceID + packageName + "1" + "appkey")
        let md5 = md5Hex(sha1)
        return "div101.\(deviceID)\(md5)"
    }

    static func androidUserAgent(deviceID: String, profile: PikPakClientProfile) -> String {
        let sign = deviceSign(deviceID: deviceID, packageName: profile.packageName)
        let millis = Int(Date().timeIntervalSince1970 * 1000)
        return [
            "ANDROID-\(profile.packageName)/\(profile.clientVersion)",
            "protocolVersion/200",
            "accesstype/",
            "clientid/\(profile.clientID)",
            "clientversion/\(profile.clientVersion)",
            "action_type/",
            "networktype/WIFI",
            "sessionid/",
            "deviceid/\(deviceID)",
            "providername/NONE",
            "devicesign/\(sign)",
            "refresh_token/",
            "sdkversion/\(profile.sdkVersion)",
            "datetime/\(millis)",
            "usrno/",
            "appname/android-\(profile.packageName)",
            "session_origin/",
            "grant_type/",
            "appid/",
            "clientip/",
            "devicename/Xiaomi_M2004j7ac",
            "osversion/13",
            "platformversion/10",
            "accessmode/",
            "devicemodel/M2004J7AC",
        ].joined(separator: " ")
    }
}

enum PathUtil {
    static func sanitize(_ name: String) -> String {
        let invalid = CharacterSet(charactersIn: "/:\\?%*|\"<>")
        let trimmed = name.components(separatedBy: invalid).joined(separator: "_")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "untitled" : trimmed
    }

    static func formatBytes(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }
}

enum ShareLinkParser {
    static func parse(_ raw: String) throws -> ParsedShareLink {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let host = url.host?.lowercased(),
              host.contains("mypikpak"),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else {
            throw PikPakError.invalidURL
        }
        let parts = components.path.split(separator: "/").map(String.init)
        guard parts.count >= 2, parts[0] == "s" else {
            throw PikPakError.invalidURL
        }
        return ParsedShareLink(
            shareId: parts[1],
            parentId: parts.count >= 3 ? parts[2] : ""
        )
    }
}
