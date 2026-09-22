import SwiftUI

extension Color {
    // MARK: - Brand Colors
    
    static let brandGreen = Color(hex: "#10A050")
    static let brandGreenPressed = Color(hex: "#0C8A44")
    static let brandGreenSoft = Color(hex: "#E6F6EE")
    
    // MARK: - Accent Colors
    
    static let accentYellow = Color(hex: "#F8C020")
    static let accentYellowSoft = Color(hex: "#FFF6D6")
    static let accentBlush = Color(hex: "#F8B0A8")
    static let accentBlushSoft = Color(hex: "#FDEEEE")
    
    // MARK: - Neutral Colors (Paper-like warmth)
    
    static let bgApp = Color(hex: "#F7F6F3")
    static let bgElevated = Color(hex: "#FFFFFF")
    static let bgGrouped = Color(hex: "#EFEDE8")
    
    static let inkPrimary = Color(hex: "#1C1B19")
    static let inkSecondary = Color(hex: "#6F6B63")
    static let inkTertiary = Color(hex: "#9A958C")
    
    static let lineHairline = Color(hex: "#E6E2DA")
    
    // MARK: - State Colors
    
    static let stateDanger = Color(hex: "#D94841")
    static let stateWarning = Color(hex: "#C98500")
    
    // MARK: - Helper initializer
    
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Semantic Names

extension Color {
    static let rabbitPrimary = brandGreen
    static let rabbitSuccess = brandGreen
    static let rabbitCreative = accentYellow
    static let rabbitWarm = accentBlush
}
