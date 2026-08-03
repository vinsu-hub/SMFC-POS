"""PDF payslip rendering for HR Payroll.

Pure rendering only — no DB access. Callers (app/routers/hr.py) fetch the
employee/branch/attendance data and pass it in, so this module stays testable
in isolation and the reportlab dependency stays contained to one file.

Amounts are formatted as "PHP 1,234.56" rather than the peso glyph (U+20B1):
reportlab's base14 fonts use WinAnsiEncoding, which doesn't include it, and
silently building a PDF with the character present doesn't guarantee the
glyph actually renders — spelling out the currency code sidesteps that
entirely without needing to embed a Unicode TTF font.
"""

import io
from datetime import date, datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

_HEADING = colors.HexColor("#14524B")
_MUTED = colors.HexColor("#6F6A5C")
_BORDER = colors.HexColor("#E7DFCC")
_STRIPE = colors.HexColor("#F3EEE2")


def _money(amount: float) -> str:
    return f"PHP {amount:,.2f}"


def _fmt_time(value: str | None) -> str:
    if not value:
        return "-"
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt.strftime("%I:%M %p")


def build_payslip_pdf(
    employee: dict,
    branch_name: str,
    company_name: str,
    period_start: date,
    period_end: date,
    hours_worked: float,
    pay_rate: float,
    total_pay: float,
    attendance_rows: list[dict],
    overtime_hours: float | None = None,
    overtime_pay: float | None = None,
    night_diff_hours: float | None = None,
    night_diff_pay: float | None = None,
    holiday_pay: float | None = None,
    hr_signatory_name: str | None = None,
    hr_signature_image: bytes | None = None,
) -> bytes:
    """attendance_rows: list of {date, clock_in, clock_out, hours_worked,
    status, auto_closed, breaks: [{break_start, break_end}, ...]}, one entry
    per hr.attendance_logs row in the period, ordered by date.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "PayslipTitle", parent=styles["Title"], fontSize=16, textColor=_HEADING,
        spaceAfter=2, alignment=0,
    )
    company_style = ParagraphStyle(
        "Company", parent=styles["Normal"], fontSize=13, textColor=_HEADING, fontName="Helvetica-Bold",
    )
    branch_style = ParagraphStyle("Branch", parent=styles["Normal"], fontSize=10, textColor=_MUTED)
    section_style = ParagraphStyle(
        "Section", parent=styles["Heading2"], fontSize=11, textColor=_HEADING, spaceBefore=12, spaceAfter=6,
    )
    small_style = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8, textColor=_MUTED)

    story = [
        Paragraph(company_name, company_style),
        Paragraph(branch_name, branch_style),
        Paragraph("PAYSLIP", title_style),
        Paragraph(f"Generated {datetime.now().strftime('%b %d, %Y %I:%M %p')}", small_style),
        Spacer(1, 12),
    ]

    info_data = [
        ["Employee", employee.get("full_name") or "-"],
        ["Employee #", employee.get("employee_number") or "-"],
        ["Position", employee.get("position") or "-"],
        ["Pay Period", f"{period_start.strftime('%b %d, %Y')} - {period_end.strftime('%b %d, %Y')}"],
    ]
    info_table = Table(info_data, colWidths=[1.5 * inch, 4.5 * inch])
    info_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (0, -1), _MUTED),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, _BORDER),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Summary", section_style))
    summary_data = [
        ["Total Hours Worked", f"{hours_worked:.2f} hrs"],
        ["Hourly Rate", _money(pay_rate)],
    ]
    if overtime_hours:
        summary_data.append(["Overtime Hours", f"{overtime_hours:.2f} hrs"])
        summary_data.append(["Overtime Pay", _money(overtime_pay or 0)])
    if night_diff_hours:
        summary_data.append(["Night Differential Hours", f"{night_diff_hours:.2f} hrs"])
        summary_data.append(["Night Differential Pay", _money(night_diff_pay or 0)])
    if holiday_pay:
        summary_data.append(["Holiday Premium Pay", _money(holiday_pay)])
    summary_data.append(["TOTAL PAY", _money(total_pay)])
    summary_table = Table(summary_data, colWidths=[3 * inch, 3 * inch])
    summary_table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, -1), (-1, -1), 13),
                ("TEXTCOLOR", (0, -1), (-1, -1), _HEADING),
                ("LINEABOVE", (0, -1), (-1, -1), 1, _HEADING),
                ("TOPPADDING", (0, -1), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Daily Time Log", section_style))
    log_data = [["Date", "Clock In", "Clock Out", "Hours", "Status", "Breaks"]]
    if not attendance_rows:
        log_data.append(["No attendance records for this period", "", "", "", "", ""])
    for row in attendance_rows:
        breaks_str = (
            "; ".join(
                f"{_fmt_time(b.get('break_start'))}-{_fmt_time(b.get('break_end'))}"
                for b in row.get("breaks", [])
            )
            or "-"
        )
        status_label = row.get("status") or "-"
        if row.get("auto_closed"):
            status_label += " (auto-closed - review)"
        hours = row.get("hours_worked")
        log_data.append(
            [
                row.get("date") or "-",
                _fmt_time(row.get("clock_in")),
                _fmt_time(row.get("clock_out")),
                f"{hours:.2f}" if hours is not None else "-",
                status_label,
                breaks_str,
            ]
        )

    log_table = Table(
        log_data,
        colWidths=[0.9 * inch, 0.9 * inch, 0.9 * inch, 0.6 * inch, 1.3 * inch, 1.7 * inch],
        repeatRows=1,
    )
    log_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), _HEADING),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ("GRID", (0, 0), (-1, -1), 0.5, _BORDER),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _STRIPE]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(log_table)
    story.append(Spacer(1, 36))

    approver_cell = "_______________________"
    if hr_signature_image:
        img_reader = ImageReader(io.BytesIO(hr_signature_image))
        img_w, img_h = img_reader.getSize()
        display_h = 0.5 * inch
        display_w = min(2.5 * inch, display_h * img_w / img_h)
        approver_cell = Image(io.BytesIO(hr_signature_image), width=display_w, height=display_h)

    approver_label: str | Paragraph = "Approved By / Date"
    if hr_signatory_name:
        signatory_style = ParagraphStyle(
            "Signatory", parent=styles["Normal"], fontSize=9, textColor=_MUTED, leading=11,
        )
        approver_label = Paragraph(f"{hr_signatory_name}<br/>Approved By / Date", signatory_style)

    sig_data = [
        ["_______________________", approver_cell],
        ["Employee Signature / Date", approver_label],
    ]
    sig_table = Table(sig_data, colWidths=[3 * inch, 3 * inch])
    sig_table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 1), (-1, 1), _MUTED),
                ("TOPPADDING", (0, 1), (-1, 1), 2),
                ("VALIGN", (0, 0), (-1, 0), "BOTTOM"),
            ]
        )
    )
    story.append(sig_table)

    doc.build(story)
    return buffer.getvalue()
