/**
 * Jetpack Compose (Kotlin) emitter.
 *
 * Mapping:
 *   - screens            -> @Composable functions; navigation via navigation-compose
 *                           NavHost with one route per screen
 *   - screen-local state -> remember { mutableStateOf(...) } / mutableStateListOf
 *   - global state       -> object AppState with top-level mutableStateOf fields
 *   - bind               -> direct reads (Compose recomposes automatically)
 *   - events     