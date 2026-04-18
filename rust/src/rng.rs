//! Mulberry32 PRNG — byte-identical port of `_createSongRng` in `src/state.js:8–16`.
//!
//! JS reference:
//! ```js
//! var state = seed | 0;
//! state = (state + 0x6D2B79F5) | 0;
//! var t = Math.imul(state ^ (state >>> 15), 1 | state);
//! t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
//! return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
//! ```
//! JS int ops are 32-bit two's-complement with wrap; `Math.imul` = low-32
//! of signed multiply. `u32` + `wrapping_{add,mul}` produces the same bit
//! pattern, so the f64 result divides by 2^32 exactly as in JS.

#[derive(Clone)]
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    /// JS: `var state = seed | 0` — a plain i32 cast. Passing a negative
    /// signed seed produces the same u32 bit pattern via `as u32`.
    pub fn new(seed: i32) -> Self {
        Self { state: seed as u32 }
    }

    pub fn next_f64(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6D2B79F5);
        let s = self.state;
        let mut t = (s ^ (s >> 15)).wrapping_mul(1 | s);
        t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Golden reference captured by running the JS RNG in Node:
    ///
    /// ```sh
    /// node -e 'var s=12345|0;
    ///   function r(){s=(s+0x6D2B79F5)|0;var t=Math.imul(s^(s>>>15),1|s);
    ///     t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;}
    ///   for(var i=0;i<10;i++)console.log(r().toFixed(17));'
    /// ```
    #[test]
    fn golden_seed_12345() {
        let mut r = Mulberry32::new(12345);
        let expected: [f64; 10] = [
            0.979_728_267_760_947_4,
            0.306_752_264_499_664_3,
            0.484_205_421_525_985,
            0.817_934_412_509_203,
            0.509_428_369_347_006_1,
            0.347_471_860_470_250_25,
            0.073_757_541_831_582_78,
            0.766_396_467_341_110_1,
            0.996_826_439_397_409_6,
            0.825_022_485_107_183_5,
        ];
        for (i, e) in expected.iter().enumerate() {
            let got = r.next_f64();
            assert!(
                (got - e).abs() < 1e-15,
                "step {i}: got {got}, expected {e}"
            );
        }
    }

    #[test]
    fn deterministic_same_seed() {
        let mut a = Mulberry32::new(42);
        let mut b = Mulberry32::new(42);
        for _ in 0..1000 {
            assert_eq!(a.next_f64().to_bits(), b.next_f64().to_bits());
        }
    }

    #[test]
    fn range_0_to_1() {
        let mut r = Mulberry32::new(7);
        for _ in 0..10_000 {
            let v = r.next_f64();
            assert!((0.0..1.0).contains(&v), "{v} out of [0,1)");
        }
    }
}
