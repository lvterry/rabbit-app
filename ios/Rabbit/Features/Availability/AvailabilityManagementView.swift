import SwiftUI
import RabbitKit

struct AvailabilityManagementView: View {
    @Bindable var viewModel: AvailabilityViewModel
    @State private var showAddRule = false
    @State private var showAddException = false
    
    var body: some View {
        NavigationStack {
            List {
                if let availability = viewModel.availability {
                    // Weekly rules section
                    Section("每周开放时间") {
                        ForEach(1...7, id: \.self) { weekday in
                            WeekdayRulesView(
                                weekday: weekday,
                                weekdayLabel: availability.weekdayLabels[weekday - 1],
                                rules: availability.byWeekday[String(weekday)] ?? [],
                                onAdd: { showAddRule = true },
                                onDelete: { rule in
                                    Task {
                                        await viewModel.deleteRule(id: rule.ruleId)
                                    }
                                }
                            )
                        }
                    }
                    
                    // Exceptions section
                    if !availability.exceptions.isEmpty {
                        Section("临时关闭") {
                            ForEach(availability.exceptions) { exception in
                                ExceptionRow(exception: exception)
                                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                        Button(role: .destructive) {
                                            Task {
                                                await viewModel.deleteException(id: exception.exceptionId)
                                            }
                                        } label: {
                                            Label("删除", systemImage: "trash")
                                        }
                                    }
                            }
                        }
                    }
                    
                    // Add exception button
                    Section {
                        Button {
                            showAddException = true
                        } label: {
                            Label("添加临时关闭", systemImage: "plus.circle")
                        }
                    }
                } else if viewModel.isLoading {
                    ProgressView()
                } else if let error = viewModel.error {
                    ContentUnavailableView {
                        Label("加载失败", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(error.errorDescription ?? "未知错误")
                    } actions: {
                        Button("重试") {
                            Task { await viewModel.refresh() }
                        }
                    }
                }
            }
            .navigationTitle("开放时间")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showAddRule = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddRule) {
                AddRuleView(viewModel: viewModel)
            }
            .sheet(isPresented: $showAddException) {
                AddExceptionView(viewModel: viewModel)
            }
        }
        .task {
            if viewModel.availability == nil {
                await viewModel.refresh()
            }
        }
    }
}

// MARK: - Weekday Rules View

struct WeekdayRulesView: View {
    let weekday: Int
    let weekdayLabel: String
    let rules: [AvailabilityRule]
    let onAdd: () -> Void
    let onDelete: (AvailabilityRule) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(weekdayLabel)
                    .font(.headline)
                
                Spacer()
                
                if rules.isEmpty {
                    Button("添加") {
                        onAdd()
                    }
                    .font(.caption)
                }
            }
            
            if rules.isEmpty {
                Text("未设置")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(rules) { rule in
                    HStack {
                        Text(formatTime(rule.startMinute) + " - " + formatTime(rule.endMinute))
                            .font(.subheadline)
                        
                        Spacer()
                        
                        Button {
                            onDelete(rule)
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
    
    private func formatTime(_ minutes: Int) -> String {
        let hours = minutes / 60
        let mins = minutes % 60
        return String(format: "%02d:%02d", hours, mins)
    }
}

// MARK: - Exception Row

struct ExceptionRow: View {
    let exception: AvailabilityException
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(exception.onDate)
                    .font(.headline)
                
                Spacer()
                
                if exception.wholeDay {
                    Text("全天")
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.orange.opacity(0.2))
                        .cornerRadius(4)
                }
            }
            
            Text(exception.rangeLabel)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            
            if let reason = exception.reason {
                Text(reason)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Add Rule View

struct AddRuleView: View {
    @Bindable var viewModel: AvailabilityViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var selectedWeekday = 1
    @State private var startHour = 14
    @State private var startMinute = 0
    @State private var endHour = 18
    @State private var endMinute = 0
    
    var body: some View {
        NavigationStack {
            Form {
                Picker("星期", selection: $selectedWeekday) {
                    ForEach(1...7, id: \.self) { day in
                        Text(weekdayLabel(day)).tag(day)
                    }
                }
                
                Section("开始时间") {
                    Picker("小时", selection: $startHour) {
                        ForEach(0..<24) { hour in
                            Text(String(format: "%02d", hour)).tag(hour)
                        }
                    }
                    .pickerStyle(.wheel)
                    
                    Picker("分钟", selection: $startMinute) {
                        ForEach([0, 15, 30, 45], id: \.self) { minute in
                            Text(String(format: "%02d", minute)).tag(minute)
                        }
                    }
                    .pickerStyle(.wheel)
                }
                
                Section("结束时间") {
                    Picker("小时", selection: $endHour) {
                        ForEach(0..<24) { hour in
                            Text(String(format: "%02d", hour)).tag(hour)
                        }
                    }
                    .pickerStyle(.wheel)
                    
                    Picker("分钟", selection: $endMinute) {
                        ForEach([0, 15, 30, 45], id: \.self) { minute in
                            Text(String(format: "%02d", minute)).tag(minute)
                        }
                    }
                    .pickerStyle(.wheel)
                }
            }
            .navigationTitle("添加开放时间")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        Task {
                            let startMinutes = startHour * 60 + startMinute
                            let endMinutes = endHour * 60 + endMinute
                            await viewModel.createRule(
                                weekday: selectedWeekday,
                                startMinute: startMinutes,
                                endMinute: endMinutes
                            )
                            dismiss()
                        }
                    }
                }
            }
        }
    }
    
    private func weekdayLabel(_ day: Int) -> String {
        ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][day - 1]
    }
}

// MARK: - Add Exception View

struct AddExceptionView: View {
    @Bindable var viewModel: AvailabilityViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var date = Date()
    @State private var wholeDay = true
    @State private var startHour = 14
    @State private var startMinute = 0
    @State private var endHour = 18
    @State private var endMinute = 0
    @State private var reason = ""
    
    var body: some View {
        NavigationStack {
            Form {
                DatePicker("日期", selection: $date, displayedComponents: .date)
                
                Toggle("全天关闭", isOn: $wholeDay)
                
                if !wholeDay {
                    Section("开始时间") {
                        Picker("小时", selection: $startHour) {
                            ForEach(0..<24) { hour in
                                Text(String(format: "%02d", hour)).tag(hour)
                            }
                        }
                        .pickerStyle(.wheel)
                        
                        Picker("分钟", selection: $startMinute) {
                            ForEach([0, 15, 30, 45], id: \.self) { minute in
                                Text(String(format: "%02d", minute)).tag(minute)
                            }
                        }
                        .pickerStyle(.wheel)
                    }
                    
                    Section("结束时间") {
                        Picker("小时", selection: $endHour) {
                            ForEach(0..<24) { hour in
                                Text(String(format: "%02d", hour)).tag(hour)
                            }
                        }
                        .pickerStyle(.wheel)
                        
                        Picker("分钟", selection: $endMinute) {
                            ForEach([0, 15, 30, 45], id: \.self) { minute in
                                Text(String(format: "%02d", minute)).tag(minute)
                            }
                        }
                        .pickerStyle(.wheel)
                    }
                }
                
                Section {
                    TextField("原因（可选）", text: $reason, axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle("添加临时关闭")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        Task {
                            let formatter = DateFormatter()
                            formatter.dateFormat = "yyyy-MM-dd"
                            let dateString = formatter.string(from: date)
                            
                            let startMinutes = wholeDay ? nil : (startHour * 60 + startMinute)
                            let endMinutes = wholeDay ? nil : (endHour * 60 + endMinute)
                            
                            await viewModel.createException(
                                onDate: dateString,
                                wholeDay: wholeDay,
                                startMinute: startMinutes,
                                endMinute: endMinutes,
                                reason: reason.isEmpty ? nil : reason
                            )
                            dismiss()
                        }
                    }
                }
            }
        }
    }
}

#Preview {
    AvailabilityManagementView(viewModel: AvailabilityViewModel(
        repo: MockAvailabilityRepository()
    ))
}
