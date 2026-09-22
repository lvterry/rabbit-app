import SwiftUI

/// Completion animation: green check with optional yellow spark
/// Per ui-ux.md §8: ~300ms scale+fade, optional spark ≤400ms total
/// Respects Reduce Motion: static check only when enabled
struct CompletionCheckmark: View {
    let withSpark: Bool
    @State private var showCheck = false
    @State private var showSpark = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    
    init(withSpark: Bool = false) {
        self.withSpark = withSpark
    }
    
    var body: some View {
        ZStack {
            // Green checkmark
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.brandGreen)
                .scaleEffect(showCheck ? 1.0 : 0.92)
                .opacity(showCheck ? 1.0 : 0.0)
            
            // Optional yellow spark
            if withSpark && showSpark && !reduceMotion {
                SparkView()
            }
        }
        .onAppear {
            if reduceMotion {
                // Reduce Motion: static check, no animation
                showCheck = true
            } else {
                // Standard animation: 300ms scale+fade
                withAnimation(.easeOut(duration: 0.3)) {
                    showCheck = true
                }
                
                // Optional spark after check appears
                if withSpark {
                    Task {
                        try? await Task.sleep(for: .milliseconds(200))
                        withAnimation(.easeOut(duration: 0.2)) {
                            showSpark = true
                        }
                    }
                }
            }
        }
    }
}

/// Yellow spark accent (1-2 particles)
private struct SparkView: View {
    @State private var opacity: Double = 1.0
    @State private var offset: CGSize = .zero
    
    var body: some View {
        Image(systemName: "sparkle")
            .font(.system(size: 20))
            .foregroundColor(.accentYellow)
            .opacity(opacity)
            .offset(offset)
            .onAppear {
                withAnimation(.easeOut(duration: 0.2)) {
                    opacity = 0.0
                    offset = CGSize(width: 30, height: -20)
                }
            }
    }
}

#Preview("With Spark") {
    CompletionCheckmark(withSpark: true)
        .frame(width: 200, height: 200)
}

#Preview("No Spark") {
    CompletionCheckmark(withSpark: false)
        .frame(width: 200, height: 200)
}
