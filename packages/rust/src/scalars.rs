//! Built-in scalar types. Custom types wrapping a string are JSON strings on the wire, and `validate` checks the format.

use crate::error::ValidationError;
use crate::validate::{VResult, Validate};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::sync::OnceLock;

fn re(cell: &'static OnceLock<regex::Regex>, pattern: &str) -> &'static regex::Regex {
    cell.get_or_init(|| regex::Regex::new(pattern).expect("regex"))
}

macro_rules! string_scalar {
    ($(#[$m:meta])* $name:ident, |$s:ident| $check:expr, $msg:expr) => {
        $(#[$m])*
        #[derive(Debug, Clone, Default, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl $name {
            pub fn new(s: impl Into<String>) -> Self {
                $name(s.into())
            }
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl From<&str> for $name {
            fn from(s: &str) -> Self {
                $name(s.to_string())
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(&self.0)
            }
        }

        impl Validate for $name {
            fn validate(&self, path: &str) -> VResult {
                let $s: &str = &self.0;
                if $check {
                    Ok(())
                } else {
                    Err(ValidationError::new(path, $msg))
                }
            }
        }
    };
}

fn uuid_ok(s: &str, version: Option<char>) -> bool {
    static ANY: OnceLock<regex::Regex> = OnceLock::new();
    let r = re(&ANY, r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-([0-9a-fA-F])[0-9a-fA-F]{3}-([0-9a-fA-F])[0-9a-fA-F]{3}-[0-9a-fA-F]{12}$");
    match r.captures(s) {
        None => false,
        Some(c) => match version {
            None => true,
            Some(v) => c[1].starts_with(v) && matches!(c[2].chars().next(), Some('8' | '9' | 'a' | 'b' | 'A' | 'B')),
        },
    }
}

fn days_in_month(y: i32, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        2 => 28,
        _ => 0,
    }
}

fn date_ok(s: &str) -> bool {
    static R: OnceLock<regex::Regex> = OnceLock::new();
    let Some(c) = re(&R, r"^(\d{4})-(\d{2})-(\d{2})$").captures(s) else { return false };
    let (y, m, d): (i32, u32, u32) = (c[1].parse().unwrap(), c[2].parse().unwrap(), c[3].parse().unwrap());
    (1..=12).contains(&m) && d >= 1 && d <= days_in_month(y, m)
}

string_scalar!(
    /// Email address
    Email,
    |s| { static R: OnceLock<regex::Regex> = OnceLock::new(); re(&R, r"^[^\s@]+@[^\s@]+\.[^\s@]+$").is_match(s) },
    "email の形式が不正です"
);
string_scalar!(
    /// E.164 phone number
    Phone,
    |s| { static R: OnceLock<regex::Regex> = OnceLock::new(); re(&R, r"^\+[1-9]\d{1,14}$").is_match(s) },
    "phone は E.164 の形式にしてください"
);
string_scalar!(Uuid, |s| uuid_ok(s, None), "uuid の形式が不正です");
string_scalar!(Uuidv4, |s| uuid_ok(s, Some('4')), "uuidv4 の形式が不正です");
string_scalar!(Uuidv7, |s| uuid_ok(s, Some('7')), "uuidv7 の形式が不正です");
string_scalar!(
    /// `YYYY-MM-DD`
    Date,
    |s| date_ok(s),
    "date は YYYY-MM-DD の形式にしてください"
);
string_scalar!(
    /// `HH:MM:SS`
    Time,
    |s| { static R: OnceLock<regex::Regex> = OnceLock::new(); re(&R, r"^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$").is_match(s) },
    "time は HH:MM:SS の形式にしてください"
);
string_scalar!(
    /// RFC 3339 (with time zone)
    DateTime,
    |s| {
        static R: OnceLock<regex::Regex> = OnceLock::new();
        re(&R, r"^(\d{4}-\d{2}-\d{2})[Tt]([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?([Zz]|[+-]([01]\d|2[0-3]):[0-5]\d)$")
            .captures(s)
            .map_or(false, |c| date_ok(&c[1]))
    },
    "datetime は RFC 3339 の形式にしてください"
);
string_scalar!(
    /// For amounts etc. A string to avoid rounding errors
    Decimal,
    |s| { static R: OnceLock<regex::Regex> = OnceLock::new(); re(&R, r"^-?\d+(\.\d+)?$").is_match(s) },
    "decimal は数値の文字列にしてください"
);
string_scalar!(
    Url,
    |s| { static R: OnceLock<regex::Regex> = OnceLock::new(); re(&R, r"^[A-Za-z][A-Za-z0-9+.-]*://[^\s/?#]+[^\s]*$").is_match(s) },
    "url は http(s)://host/... の形式にしてください"
);

impl Decimal {
    /// Used to compare against constraints (ranges)
    pub fn to_f64(&self) -> f64 {
        self.0.parse().unwrap_or(f64::NAN)
    }
}

/// A 64-bit integer sent as a string on the wire (JavaScript loses precision above 2^53).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Int64(pub i64);

impl Serialize for Int64 {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.0.to_string())
    }
}

impl<'de> Deserialize<'de> for Int64 {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        s.parse::<i64>().map(Int64).map_err(|_| serde::de::Error::custom("int64 は整数の文字列で送ってください"))
    }
}

impl Validate for Int64 {
    fn validate(&self, _: &str) -> VResult {
        Ok(())
    }
}

/// A base64 string on the wire.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Bytes(pub Vec<u8>);

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn base64_decode(s: &str) -> Option<Vec<u8>> {
    let s = s.trim_end_matches('=');
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0);
    for c in s.bytes() {
        let v = B64.iter().position(|&b| b == c)? as u32;
        acc = acc << 6 | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

impl Serialize for Bytes {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&base64_encode(&self.0))
    }
}

impl<'de> Deserialize<'de> for Bytes {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        base64_decode(&s).map(Bytes).ok_or_else(|| serde::de::Error::custom("bytes は base64 の文字列にしてください"))
    }
}

impl Validate for Bytes {
    fn validate(&self, _: &str) -> VResult {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates() {
        assert!(Email::new("a@b.co").validate("e").is_ok());
        assert!(Email::new("nope").validate("e").is_err());
        assert!(Phone::new("+819012345678").validate("p").is_ok());
        assert!(Phone::new("0901234").validate("p").is_err());
        assert!(Uuidv4::new("3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10").validate("u").is_ok());
        assert!(Uuidv4::new("3f2b8c1e-5d4a-7b6e-9c1d-2a7f0e8b9c10").validate("u").is_err());
        assert!(Uuidv7::new("3f2b8c1e-5d4a-7b6e-9c1d-2a7f0e8b9c10").validate("u").is_ok());
        assert!(Uuid::new("3f2b8c1e-5d4a-7b6e-9c1d-2a7f0e8b9c10").validate("u").is_ok());
        assert!(Uuid::new("x").validate("u").is_err());
        assert!(Date::new("2024-02-29").validate("d").is_ok());
        assert!(Date::new("2023-02-29").validate("d").is_err());
        assert!(Time::new("23:59:59").validate("t").is_ok());
        assert!(Time::new("24:00:00").validate("t").is_err());
        assert!(DateTime::new("2024-01-02T03:04:05Z").validate("t").is_ok());
        assert!(DateTime::new("2024-01-02T03:04:05.123+09:00").validate("t").is_ok());
        assert!(DateTime::new("2024-01-02 03:04:05").validate("t").is_err());
        assert!(Decimal::new("-12.50").validate("d").is_ok());
        assert!(Decimal::new("1e5").validate("d").is_err());
        assert!(Url::new("https://example.com/a?b=c").validate("u").is_ok());
        assert!(Url::new("example.com").validate("u").is_err());
    }

    #[test]
    fn int64_and_bytes_roundtrip() {
        assert_eq!(serde_json::to_string(&Int64(9007199254740993)).unwrap(), "\"9007199254740993\"");
        let n: Int64 = serde_json::from_str("\"-5\"").unwrap();
        assert_eq!(n, Int64(-5));
        assert!(serde_json::from_str::<Int64>("5").is_err());
        let b = Bytes(b"hello!?".to_vec());
        let j = serde_json::to_string(&b).unwrap();
        assert_eq!(j, "\"aGVsbG8hPw==\"");
        assert_eq!(serde_json::from_str::<Bytes>(&j).unwrap(), b);
    }
}
