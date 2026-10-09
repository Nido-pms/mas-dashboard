import math


def clean(value):
    """Return a trimmed string, or None for null / NaN / empty values."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)  # Excel numbers come through as floats: "1001", not "1001.0"
    s = str(value).strip()
    return None if s.lower() in ("", "nan", "none", "null") else s
