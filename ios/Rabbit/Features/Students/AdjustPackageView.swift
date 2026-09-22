import SwiftUI
import RabbitKit

struct AdjustPackageView: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var viewModel: AdjustPackageViewModel
    
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: Spacing.md) {
                        Text("当前课时")
                            .font(.subheadline)
                            .foregroundColor(.inkSecondary)
                        
                        HStack {
                            Text("\(viewModel.currentRemaining)")
                                .font(.largeTitle)
                                .fontWeight(.bold)
                                .foregroundColor(.inkPrimary)
                            
                            Text("/ \(viewModel.currentPurchased)")
                                .font(.title2)
                                .foregroundColor(.inkSecondary)
                            
                            Text("节")
                                .font(.title3)
                                .foregroundColor(.inkSecondary)
                        }
                    }
                    .padding(.vertical, Spacing.sm)
                }
                
                Section {
                    Stepper(value: $viewModel.newValue, in: 0...999) {
                        HStack {
                            Text("调整至")
                                .foregroundColor(.inkPrimary)
                            
                            Spacer()
                            
                            Text("\(viewModel.newValue)")
                                .font(.title3)
                                .fontWeight(.semibold)
                                .monospacedDigit()
                                .foregroundColor(.brandGreen)
                            
                            Text("节")
                                .foregroundColor(.inkSecondary)
                        }
                    }
                } header: {
                    Text("新课时数")
                }
                
                Section {
                    VStack(alignment: .leading, spacing: Spacing.lg) {
                        Text("调整原因")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.inkPrimary)
                        
                        AdjustmentTypeButton(
                            type: .purchaseAdjustment,
                            isSelected: viewModel.adjustmentType == .purchaseAdjustment,
                            action: { viewModel.adjustmentType = .purchaseAdjustment }
                        )
                        
                        AdjustmentTypeButton(
                            type: .balanceAdjustment,
                            isSelected: viewModel.adjustmentType == .balanceAdjustment,
                            action: { viewModel.adjustmentType = .balanceAdjustment }
                        )
                    }
                    .padding(.vertical, Spacing.sm)
                } header: {
                    Text("必须选择")
                } footer: {
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("• 购买量记错：这批实际买了更多/更少节课")
                        Text("• 消耗记错：少扣/多扣了课时，购买量不变")
                    }
                    .font(.caption)
                    .foregroundColor(.inkSecondary)
                }
                
                Section {
                    TextField("备注（可选）", text: $viewModel.note, axis: .vertical)
                        .lineLimit(3...6)
                } header: {
                    Text("备注")
                }
            }
            .navigationTitle("调整课时")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("确认") {
                        Task {
                            await viewModel.submit()
                            if !viewModel.hasError {
                                dismiss()
                            }
                        }
                    }
                    .disabled(!viewModel.canSubmit)
                    .fontWeight(.semibold)
                }
            }
            .alert("调整失败", isPresented: $viewModel.showError) {
                Button("确定", role: .cancel) {}
            } message: {
                if let error = viewModel.error {
                    Text(error.errorDescription ?? "未知错误")
                }
            }
        }
    }
}

// MARK: - Adjustment Type Button

struct AdjustmentTypeButton: View {
    let type: AdjustmentType
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.md) {
                ZStack {
                    Circle()
                        .strokeBorder(isSelected ? Color.brandGreen : Color.lineHairline, lineWidth: 2)
                        .frame(width: 24, height: 24)
                    
                    if isSelected {
                        Circle()
                            .fill(Color.brandGreen)
                            .frame(width: 12, height: 12)
                    }
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(type.title)
                        .font(.body)
                        .fontWeight(.semibold)
                        .foregroundColor(.inkPrimary)
                    
                    Text(type.description)
                        .font(.caption)
                        .foregroundColor(.inkSecondary)
                }
                
                Spacer()
            }
            .padding(Spacing.lg)
            .background(isSelected ? Color.brandGreenSoft : Color.bgElevated)
            .cornerRadius(CornerRadius.md)
            .overlay {
                RoundedRectangle(cornerRadius: CornerRadius.md)
                    .strokeBorder(isSelected ? Color.brandGreen : Color.lineHairline, lineWidth: 1.5)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Adjustment Type Enum

enum AdjustmentType {
    case purchaseAdjustment
    case balanceAdjustment
    
    var title: String {
        switch self {
        case .purchaseAdjustment:
            return "购买量记错"
        case .balanceAdjustment:
            return "消耗记错"
        }
    }
    
    var description: String {
        switch self {
        case .purchaseAdjustment:
            return "这批课时实际购买数量不对"
        case .balanceAdjustment:
            return "上课记录有误，购买量正确"
        }
    }
}

// MARK: - View Model

@Observable
class AdjustPackageViewModel {
    var packageId: String
    var currentPurchased: Int
    var currentRemaining: Int
    var newValue: Int
    var adjustmentType: AdjustmentType?
    var note: String = ""
    var isLoading = false
    var error: APIError?
    var showError = false
    
    private let packageRepo: PackageRepository
    
    init(packageId: String, purchased: Int, remaining: Int, repo: PackageRepository) {
        self.packageId = packageId
        self.currentPurchased = purchased
        self.currentRemaining = remaining
        self.newValue = remaining
        self.packageRepo = repo
    }
    
    var canSubmit: Bool {
        adjustmentType != nil && newValue != currentRemaining && !isLoading
    }
    
    var hasError: Bool {
        error != nil
    }
    
    func submit() async {
        guard let type = adjustmentType else { return }
        
        isLoading = true
        defer { isLoading = false }
        
        // TODO: Call API to adjust package
        // This should map to PURCHASE_ADJUSTMENT or BALANCE_ADJUSTMENT transaction types
        // as defined in mvp.md §12
        
        // Placeholder for now
        await Task.sleep(1_000_000_000)
    }
}

#Preview {
    AdjustPackageView(
        viewModel: AdjustPackageViewModel(
            packageId: "123",
            purchased: 10,
            remaining: 7,
            repo: MockPackageRepository()
        )
    )
}
