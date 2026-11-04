"use client";

import { Printer } from "lucide-react";
import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import {
  AppButton,
  AppFieldShell,
  AppSelect,
  PopupForm,
} from "@/components/shared";
import {
  cashSections,
  formatCashMoney,
  type CashSummary,
} from "@/lib/cash-balances";
import { businessZone } from "@/lib/business-day";
import { dateRangeLabel } from "./OpsPageShared";

export type FinancialRecordRow = {
  id: string;
  date: string;
  accountingDay?: string;
  type: string;
  title: string;
  method: string;
  currency: string;
  originalAmount?: number;
  accountingAmount: number;
  amountIn: number;
  amountOut: number;
  note: string;
  source: string;
  cashRegisterName?: string;
  customerName?: string;
};

type Paper = "80" | "58" | "a4";
type ReportData = {
  restaurantName: string;
  businessDayStartTime?: string;
  timezone?: string;
  from: string;
  to: string;
  records: FinancialRecordRow[];
  summary: CashSummary;
  currency: string;
  unconfirmedCount: number;
};
type Snapshot = ReportData & { generatedAt: string };

export function CashReportPrintButton(props: ReportData) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [paper, setPaper] = useState<Paper>("80");
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const contentRef = useRef<HTMLElement>(null);
  const print = useReactToPrint({
    contentRef,
    ignoreGlobalStyles: true,
    documentTitle: `تقرير حركة المال ${snapshot?.from || props.from} - ${snapshot?.to || props.to}`,
    pageStyle: cashReportPageStyle(paper),
    onBeforePrint: async () => {
      setPrinting(true);
      setError("");
    },
    onAfterPrint: () => setPrinting(false),
    onPrintError: () => {
      setPrinting(false);
      setError("تعذر فتح نافذة الطباعة. يمكنك إعادة المحاولة.");
    },
  });
  return (
    <>
      <AppButton
        type="button"
        variant="secondary"
        iconStart={<Printer className="h-4 w-4" />}
        onClick={() => {
          setError("");
          setSnapshot({
            ...props,
            records: props.records.map((record) => ({ ...record })),
            summary: structuredClone(props.summary),
            generatedAt: new Date().toISOString(),
          });
        }}
      >
        طباعة التقرير
      </AppButton>
      <PopupForm
        open={snapshot !== null}
        onClose={() => {
          if (!printing) setSnapshot(null);
        }}
        title="طباعة تقرير حركة المال"
        maxWidth="md"
        footer={
          <>
            <AppButton
              type="button"
              loading={printing}
              onClick={() => print()}
              iconStart={<Printer className="h-4 w-4" />}
            >
              طباعة / حفظ PDF
            </AppButton>
            <AppButton
              type="button"
              variant="secondary"
              disabled={printing}
              onClick={() => setSnapshot(null)}
            >
              إلغاء
            </AppButton>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="text-app-body">
            <p className="font-semibold">
              {snapshot
                ? dateRangeLabel({ from: snapshot.from, to: snapshot.to })
                : ""}
            </p>
            <p className="mt-1 text-app-helper text-app-muted">
              كل حركات الفترة المختارة · {snapshot?.records.length ?? 0} حركة،
              مع المجاميع وتفاصيل الطلبات.
            </p>
          </div>
          <AppFieldShell label="مقاس الورق">
            <AppSelect
              value={paper}
              disabled={printing}
              onChange={(event) => setPaper(event.target.value as Paper)}
            >
              <option value="80">طابعة فواتير — 80 مم</option>
              <option value="a4">ورق A4 / PDF</option>
            </AppSelect>
          </AppFieldShell>
          <p className="text-app-helper text-app-muted">
            للحفظ كملف PDF، اختر «حفظ كـ PDF» في نافذة الطباعة. لطابعة الفواتير
            اختر مقاس الورق المطابق للطابعة.
          </p>
          {snapshot?.records.length === 0 && (
            <p className="text-app-helper text-app-muted">
              لا توجد حركات في هذه الفترة؛ سيحتوي التقرير على المجاميع فقط.
            </p>
          )}
          {Boolean(snapshot?.unconfirmedCount) && (
            <p
              role="status"
              className="text-app-helper font-semibold text-app-muted"
            >
              يتضمن التقرير {snapshot?.unconfirmedCount} حركة لم تكتمل مزامنتها،
              وسيظهر تنبيه بذلك في النسخة المطبوعة.
            </p>
          )}
          {error && (
            <p role="alert" className="text-app-helper text-app-danger">
              {error}
            </p>
          )}
        </div>
      </PopupForm>
      <div hidden>
        {snapshot && (
          <CashReportDocument ref={contentRef} report={snapshot} paper={paper} />
        )}
      </div>
    </>
  );
}

function timestamp(value: string, kind: "full" | "date" | "time" = "full", zone?: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "غير متوفر";
  const options: Intl.DateTimeFormatOptions = { timeZone: businessZone(zone) };
  if (kind !== "time") {
    options.year = "numeric";
    options.month = "2-digit";
    options.day = "2-digit";
  }
  if (kind !== "date") {
    options.hour = "2-digit";
    options.minute = "2-digit";
    options.hour12 = false;
  }
  return new Intl.DateTimeFormat("ar-SY", options).format(new Date(value));
}

export function CashReportDocument({
  report,
  paper = "a4",
  ref,
}: {
  report: Snapshot;
  paper?: Paper;
  ref?: React.Ref<HTMLElement>;
}) {
  const { summary, currency } = report;
  return (
    <article ref={ref} className="cash-report" dir="rtl" lang="ar">
      <header>
        <h1>{report.restaurantName || "تقرير الصندوق"}</h1>
        <h2>تقرير حركة المال والصندوق</h2>
        <p>{dateRangeLabel({ from: report.from, to: report.to })}</p>
        <p>بداية اليوم المحاسبي: {report.businessDayStartTime || "04:00"} · {businessZone(report.timezone)}</p>
        <p>إيرادات الطاولات بحسب يوم فتح الطلب؛ المرتجعات بحسب وقت تنفيذها.</p>
        <p>وقت إعداد التقرير: {timestamp(report.generatedAt, undefined, report.timezone)}</p>
        <p>عدد الحركات: {report.records.length}</p>
      </header>
      {report.unconfirmedCount > 0 && (
        <p className="report-notice">
          تقرير محلي غير نهائي: {report.unconfirmedCount} حركة لم تكتمل
          مزامنتها.
        </p>
      )}
      <h3>مجاميع الفترة حسب الوسيلة والعملة</h3>
      <table className="report-summary">
        <thead>
          <tr>
            <th scope="col">الوسيلة / العملة</th>
            <th scope="col">داخل</th>
            <th scope="col">خارج</th>
            <th scope="col">الصافي</th>
          </tr>
        </thead>
        <tbody>
          {cashSections.map((section) => (
            <tr key={section.key}>
              <th scope="row">{section.label}</th>
              <td>
                {formatCashMoney(
                  summary.sections[section.key].incoming,
                  section.currency,
                )}
              </td>
              <td>
                {formatCashMoney(
                  summary.sections[section.key].outgoing,
                  section.currency,
                )}
              </td>
              <td>
                {formatCashMoney(
                  summary.sections[section.key].net,
                  section.currency,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(summary.unclassifiedCount > 0 || summary.unclassifiedNet !== 0) && (
        <p className="report-notice">
          حركات غير مصنفة: {formatCashMoney(summary.unclassifiedNet, currency)}{" "}
          — مشمولة في المجموع المحاسبي.
        </p>
      )}
      <dl className="report-totals">
        <div>
          <dt>إجمالي الداخل</dt>
          <dd>{formatCashMoney(summary.accountingIn, currency)}</dd>
        </div>
        <div>
          <dt>إجمالي الخارج</dt>
          <dd>{formatCashMoney(summary.accountingOut, currency)}</dd>
        </div>
        <div className="report-grand-total">
          <dt>صافي الفترة</dt>
          <dd>{formatCashMoney(summary.accountingNet, currency)}</dd>
        </div>
      </dl>
      <p className="report-explanation">
        المجاميع المحاسبية {currency === "SYP" ? "بالليرة السورية" : currency}{" "}
        وفق سعر الصرف المحفوظ لكل عملية. تشمل جميع حركات الفترة، ولا تمثل أرصدة
        الصناديق الحالية.
      </p>
      <h3>تفاصيل الحركات والدفعات</h3>
      {report.records.length ? (
        <table className="report-movements">
          <thead>
            <tr>
              <th scope="col" className="report-time">
                توقيت الدفعة
              </th>
              <th scope="col" className="report-amount">
                القيمة
              </th>
              <th scope="col">بيان الطلب / الحركة</th>
            </tr>
          </thead>
          <tbody>
            {report.records.map((record) => (
              <tr key={record.id}>
                <td>
                  <time dateTime={record.date}>
                    <span className="report-date">
                      {timestamp(record.date, "date", report.timezone)}
                    </span>
                    <span>{timestamp(record.date, "time", report.timezone)}</span>
                  </time>
                  {record.accountingDay && <small>اليوم المحاسبي: {record.accountingDay}</small>}
                </td>
                <td>
                  <strong>{record.type}</strong>
                  <br />
                  <strong>
                    {formatCashMoney(
                      record.originalAmount ?? record.accountingAmount,
                      record.currency,
                    )}
                  </strong>
                  {record.currency !== currency &&
                    record.originalAmount !== undefined && (
                      <small>
                        المقابل:{" "}
                        {formatCashMoney(record.accountingAmount, currency)}
                      </small>
                    )}
                  {record.originalAmount === undefined && (
                    <small>قيمة محاسبية؛ المبلغ الأصلي غير متوفر</small>
                  )}
                </td>
                <td>
                  <strong>{record.title}</strong>
                  {record.customerName && (
                    <small>الزبون: {record.customerName}</small>
                  )}
                  {paper === "a4" && (
                    <>
                      <small>
                        {record.method}
                        {record.cashRegisterName
                          ? ` · ${record.cashRegisterName}`
                          : ""}
                      </small>

                      {record.source && <small>{record.source}</small>}
                      {record.note && <small>{record.note}</small>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>لا توجد حركات خلال الفترة المختارة.</p>
      )}
      <footer>نهاية التقرير · {report.records.length} حركة</footer>
    </article>
  );
}

export function cashReportPageStyle(paper: Paper) {
  const thermal = paper !== "a4";
  const narrow = paper === "58";
  // Roll length is selected by the printer driver; constrain only the printable content width.
  return `
    @page { size: ${thermal ? "auto" : "A4 portrait"}; margin: ${thermal ? "0" : "10mm"}; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #000; background: #fff; direction: rtl; font-family: Tahoma, Arial, sans-serif; font-size: ${narrow ? "10" : thermal ? "11" : "12"}px; line-height: 1.5; }
    .cash-report { width: ${thermal ? (narrow ? "58mm" : "80mm") : "100%"}; max-width: 100%; padding: ${thermal ? "3mm 2mm 5mm" : "0"}; margin: 0 auto; }
    header { text-align: center; margin-bottom: 4mm; }
    h1 { font-size: ${thermal ? "15" : "20"}px; margin: 0 0 2mm; }
    h2 { font-size: ${thermal ? "12" : "16"}px; margin: 0 0 2mm; }
    h3 { font-size: inherit; margin: 4mm 0 2mm; }
    p { margin: 1mm 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font: inherit; }
    th, td { text-align: right; vertical-align: top; border-bottom: 1px solid #aaa; padding: ${narrow ? "1mm .5mm" : "1.5mm 1mm"}; overflow-wrap: anywhere; }
    th { font-weight: bold; border-bottom-color: #000; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    time span { display: block; }
    .report-date { white-space: nowrap; font-size: ${narrow ? ".85em" : "1em"}; }
    small { display: block; font-size: .9em; margin-top: 1mm; }
    .report-summary th:first-child { width: 31%; }
    .report-time { width: ${thermal ? "25" : "20"}%; }
    .report-amount { width: ${thermal ? "27" : "22"}%; }
    .report-totals { margin: 3mm 0; border-top: 1px solid #000; padding-top: 2mm; }
    .report-totals div { display: flex; justify-content: space-between; gap: 2mm; padding: 1mm 0; }
    dd { margin: 0; font-weight: bold; }
    .report-grand-total { border-top: 1px solid #000; font-weight: bold; margin-top: 1mm; }
    .report-explanation, footer { font-size: .9em; }
    .report-notice { border: 1px solid #000; padding: 2mm; }
    footer { border-top: 1px dashed #000; margin-top: 4mm; padding-top: 2mm; text-align: center; }
    h3 { break-after: avoid; }
  `;
}
