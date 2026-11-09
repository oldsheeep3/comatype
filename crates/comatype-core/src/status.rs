//! Status code registry. `.comat` may use only the codes registered here and those added by `additionalStatusCodes` in the config file.

use std::collections::BTreeMap;

/// Standard status codes (those in the IANA registry) and their messages
pub const BUILTIN: &[(u16, &str)] = &[
    (100, "Continue"),
    (101, "Switching Protocols"),
    (102, "Processing"),
    (103, "Early Hints"),
    (200, "OK"),
    (201, "Created"),
    (202, "Accepted"),
    (203, "Non-Authoritative Information"),
    (204, "No Content"),
    (205, "Reset Content"),
    (206, "Partial Content"),
    (207, "Multi-Status"),
    (208, "Already Reported"),
    (226, "IM Used"),
    (300, "Multiple Choices"),
    (301, "Moved Permanently"),
    (302, "Found"),
    (303, "See Other"),
    (304, "Not Modified"),
    (305, "Use Proxy"),
    (307, "Temporary Redirect"),
    (308, "Permanent Redirect"),
    (400, "Bad Request"),
    (401, "Unauthorized"),
    (402, "Payment Required"),
    (403, "Forbidden"),
    (404, "Not Found"),
    (405, "Method Not Allowed"),
    (406, "Not Acceptable"),
    (407, "Proxy Authentication Required"),
    (408, "Request Timeout"),
    (409, "Conflict"),
    (410, "Gone"),
    (411, "Length Required"),
    (412, "Precondition Failed"),
    (413, "Content Too Large"),
    (414, "URI Too Long"),
    (415, "Unsupported Media Type"),
    (416, "Range Not Satisfiable"),
    (417, "Expectation Failed"),
    (418, "I'm a teapot"),
    (421, "Misdirected Request"),
    (422, "Unprocessable Content"),
    (423, "Locked"),
    (424, "Failed Dependency"),
    (425, "Too Early"),
    (426, "Upgrade Required"),
    (428, "Precondition Required"),
    (429, "Too Many Requests"),
    (431, "Request Header Fields Too Large"),
    (451, "Unavailable For Legal Reasons"),
    (500, "Internal Server Error"),
    (501, "Not Implemented"),
    (502, "Bad Gateway"),
    (503, "Service Unavailable"),
    (504, "Gateway Timeout"),
    (505, "HTTP Version Not Supported"),
    (506, "Variant Also Negotiates"),
    (507, "Insufficient Storage"),
    (508, "Loop Detected"),
    (510, "Not Extended"),
    (511, "Network Authentication Required"),
];

/// Usable status codes → message (standard + those added by the config)
pub type StatusTable = BTreeMap<u16, String>;

pub fn builtin_table() -> StatusTable {
    BUILTIN.iter().map(|(c, m)| (*c, m.to_string())).collect()
}

/// Statuses that cannot have a body by HTTP rules (1xx, 204, 205, 304)
pub fn no_body(code: u16) -> bool {
    (100..200).contains(&code) || matches!(code, 204 | 205 | 304)
}

pub fn builtin_message(code: u16) -> Option<&'static str> {
    BUILTIN.iter().find(|(c, _)| *c == code).map(|(_, m)| *m)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_is_sorted_unique_and_in_range() {
        for w in BUILTIN.windows(2) {
            assert!(w[0].0 < w[1].0, "{:?}", w);
        }
        assert!(BUILTIN.iter().all(|(c, m)| (100..=599).contains(c) && !m.is_empty()));
        assert_eq!(builtin_message(404), Some("Not Found"));
        assert_eq!(builtin_message(306), None, "306 は未使用");
        assert_eq!(builtin_message(499), None);
    }

    #[test]
    fn bodyless_statuses() {
        for c in [100, 101, 103, 204, 205, 304] {
            assert!(no_body(c), "{c}");
        }
        for c in [200, 201, 301, 400, 404, 500] {
            assert!(!no_body(c), "{c}");
        }
    }
}
