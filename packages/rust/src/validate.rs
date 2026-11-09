//! Validation and constraints (min / max / pattern / oneof).

use crate::error::{join, ValidationError};

pub type VResult = std::result::Result<(), ValidationError>;

/// Checks that a type matches .comat. Implemented by generated structs.
pub trait Validate {
    fn validate(&self, path: &str) -> VResult;
}

impl Validate for String {
    fn validate(&self, _: &str) -> VResult {
        Ok(())
    }
}
impl Validate for bool {
    fn validate(&self, _: &str) -> VResult {
        Ok(())
    }
}
impl Validate for i64 {
    fn validate(&self, _: &str) -> VResult {
        Ok(())
    }
}
impl Validate for serde_json::Value {
    fn validate(&self, _: &str) -> VResult {
        Ok(())
    }
}
impl Validate for Vec<u8> {
    fn validate(&self, _: &str) -> VResult {
        Ok(())
    }
}
impl<T: Validate> Validate for Option<T> {
    fn validate(&self, path: &str) -> VResult {
        match self {
            Some(v) => v.validate(path),
            None => Ok(()),
        }
    }
}
impl<T: Validate> Validate for Box<T> {
    fn validate(&self, path: &str) -> VResult {
        (**self).validate(path)
    }
}
impl<T: Validate> Validate for Vec<T> {
    fn validate(&self, path: &str) -> VResult {
        for (i, v) in self.iter().enumerate() {
            v.validate(&join(path, &i.to_string()))?;
        }
        Ok(())
    }
}

fn fail(path: &str, reason: String) -> VResult {
    Err(ValidationError::new(path, reason))
}

/// String length range (`string(1..50)`)
pub fn check_len(path: &str, s: &str, min: Option<i64>, max: Option<i64>) -> VResult {
    let n = s.chars().count() as i64;
    if let Some(m) = min {
        if n < m {
            return fail(path, format!("文字数は {m} 以上にしてください"));
        }
    }
    if let Some(m) = max {
        if n > m {
            return fail(path, format!("文字数は {m} 以下にしてください"));
        }
    }
    Ok(())
}

/// Value range (`int(0..150)`)
pub fn check_range(path: &str, n: f64, min: Option<f64>, max: Option<f64>) -> VResult {
    if let Some(m) = min {
        if n < m {
            return fail(path, format!("値は {} 以上にしてください", fmt_num(m)));
        }
    }
    if let Some(m) = max {
        if n > m {
            return fail(path, format!("値は {} 以下にしてください", fmt_num(m)));
        }
    }
    Ok(())
}

fn fmt_num(n: f64) -> String {
    if n.fract() == 0.0 {
        format!("{}", n as i64)
    } else {
        n.to_string()
    }
}

pub fn check_pattern(path: &str, s: &str, pattern: &str) -> VResult {
    match regex::Regex::new(pattern) {
        Err(_) => fail(path, format!("pattern {pattern:?} が不正です")),
        Ok(re) if re.is_match(s) => Ok(()),
        Ok(_) => fail(path, format!("パターン {pattern} に一致しません")),
    }
}

pub fn check_oneof(path: &str, s: &str, values: &[&str]) -> VResult {
    if values.contains(&s) {
        Ok(())
    } else {
        fail(path, format!("{} のどれかにしてください", values.join(" | ")))
    }
}
