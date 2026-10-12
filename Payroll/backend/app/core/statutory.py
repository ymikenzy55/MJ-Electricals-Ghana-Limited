"""Ghana statutory deductions: SSNIT pension and PAYE income tax.

Rates and tax bands are stored in ``payroll_settings`` so the business can
update them when the Ghana Revenue Authority / SSNIT change them. The
defaults below are the monthly resident PAYE bands in force since 2024.
"""
from decimal import ROUND_HALF_UP, Decimal

TWO = Decimal("0.01")

# Each band is the width of the slice taxed at `rate`; the last band has no
# width (everything above). Monthly, resident individuals.
DEFAULT_TAX_BANDS: list[dict] = [
    {"width": 490, "rate": 0.0},
    {"width": 110, "rate": 0.05},
    {"width": 130, "rate": 0.10},
    {"width": 3166.67, "rate": 0.175},
    {"width": 16000, "rate": 0.25},
    {"width": 30520, "rate": 0.30},
    {"width": None, "rate": 0.35},
]


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(TWO, rounding=ROUND_HALF_UP)


def compute_paye(taxable_income: Decimal, bands: list[dict] | None) -> Decimal:
    """Progressive tax on a monthly taxable income."""
    remaining = Decimal(str(taxable_income))
    if remaining <= 0:
        return Decimal("0.00")
    tax = Decimal("0")
    for band in bands or DEFAULT_TAX_BANDS:
        rate = Decimal(str(band.get("rate", 0)))
        width = band.get("width")
        if width is None:
            tax += remaining * rate
            remaining = Decimal("0")
            break
        slice_ = min(remaining, Decimal(str(width)))
        tax += slice_ * rate
        remaining -= slice_
        if remaining <= 0:
            break
    return money(tax)


def compute_ssnit(basic: Decimal, employee_rate, employer_rate) -> tuple[Decimal, Decimal]:
    basic = Decimal(str(basic))
    return (
        money(basic * Decimal(str(employee_rate))),
        money(basic * Decimal(str(employer_rate))),
    )
