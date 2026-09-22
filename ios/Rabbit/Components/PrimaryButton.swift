import SwiftUI

struct PrimaryButton: View {
    let title: String
    let icon: String?
    let action: () -> Void
    var isDestructive: Bool = false
    var isDisabled: Bool = false
    
    init(
        _ title: String,
        icon: String? = nil,
        isDestructive: Bool = false,
        isDisabled: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.icon = icon
        self.isDestructive = isDestructive
        self.isDisabled = isDisabled
        self.action = action
    }
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.sm) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.body)
                }
                
                Text(title)
                    .font(.body)
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.lg)
            .background(backgroundColor)
            .foregroundColor(.white)
            .cornerRadius(CornerRadius.lg)
        }
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.5 : 1.0)
    }
    
    private var backgroundColor: Color {
        if isDestructive {
            return .stateDanger
        } else {
            return .brandGreen
        }
    }
}

struct SecondaryButton: View {
    let title: String
    let icon: String?
    let action: () -> Void
    var isDisabled: Bool = false
    
    init(
        _ title: String,
        icon: String? = nil,
        isDisabled: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.icon = icon
        self.isDisabled = isDisabled
        self.action = action
    }
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.sm) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.body)
                }
                
                Text(title)
                    .font(.body)
                    .fontWeight(.medium)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.lg)
            .background(Color.bgElevated)
            .foregroundColor(.brandGreen)
            .cornerRadius(CornerRadius.lg)
            .overlay {
                RoundedRectangle(cornerRadius: CornerRadius.lg)
                    .strokeBorder(Color.brandGreen, lineWidth: 1.5)
            }
        }
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.5 : 1.0)
    }
}

#Preview {
    VStack(spacing: Spacing.lg) {
        PrimaryButton("完成课程", icon: "checkmark.circle.fill") {
            print("Primary action")
        }
        
        SecondaryButton("取消", icon: "xmark") {
            print("Secondary action")
        }
        
        PrimaryButton("删除账号", isDestructive: true) {
            print("Destructive action")
        }
        
        PrimaryButton("已禁用", isDisabled: true) {
            print("Should not fire")
        }
    }
    .padding()
}
