/**
 * HTML / CSS / JS emitter.
 *
 * Mapping:
 *   - screens            -> <section class="screen"> toggled by a tiny hash-free router
 *   - screen-local state -> plain JS object per screen (S_<screen>)
 *   - global state       -> shared object G; any mutation calls updateAll()
 *   - bind / expr        -> per-screen update_<screen>() writes textContent /
 *                           checked / value / rebuilds lists
 *   - events             -> a