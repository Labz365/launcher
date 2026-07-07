/**
 * SwiftUI (Swift) emitter.
 *
 * Mapping:
 *   - screens            -> View structs; navigation via a shared Router
 *                           (NavigationStack + path of screen cases)
 *   - screen-local state -> @State properties
 *   - global state       -> AppState: ObservableObject with @Published fields,
 *                           injected as @EnvironmentObject
 *   - bind               -> direct property reads;