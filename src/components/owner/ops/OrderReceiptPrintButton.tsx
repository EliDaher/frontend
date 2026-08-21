"use client";

import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { AppButton } from "@/components/shared";
import { adminRequest } from "@/lib/api";
import type { Restaurant } from "@/types/menu";
import type { OpsOrder, OpsTable } from "@/types/ops";

const CONSUMER_TAX_RATE = 0.05;
const LOCAL_ADMIN_TAX_RATE = 0.003;
const DEFAULT_VAT_NUMBER = "105200001740";
const cutDelayMs = 2_000;
const receiptPageStyle = `
  @page {
    size: 80mm auto;
    margin: 0;
  }

  body {
    width: 80mm;
    height: auto;
    margin: 0;
    padding: 0 0 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    background: #ffffff;
    color: #000000;
    font-family: Arial, Tahoma, sans-serif;
    font-size: 12px;
  }

  * {
    box-sizing: border-box;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  td, th {
    padding: 2px;
    font-weight: bold;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: normal;
    text-align: center;
    height: auto;
  }

  .receipt-print-source {
    position: static !important;
    left: auto !important;
    top: auto !important;
    width: 80mm !important;
    max-width: 80mm !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    opacity: 1 !important;
    overflow: visible !important;
  }

  .thermal-receipt {
    position: static !important;
    width: 80mm !important;
    max-width: 80mm !important;
    height: auto !important;
    margin: 0 !important;
    padding: 16mm 4mm 8mm !important;
    overflow: visible !important;
    break-after: avoid;
    page-break-after: avoid;
    background: #ffffff !important;
    color: #000000 !important;
  }

  .receipt-meta {
    grid-template-columns: 18mm minmax(0, 1fr) 18mm !important;
  }

  .receipt-items th,
  .receipt-items td {
    max-width: 120px;
  }
`;

export function OrderReceiptPrintButton({
  order,
  restaurant,
  table,
  token,
  disabled = false
}: {
  order: OpsOrder;
  restaurant: Restaurant | null;
  table?: OpsTable | null;
  token?: string;
  disabled?: boolean;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const receipt = useMemo(() => buildReceipt(order, restaurant, table), [order, restaurant, table]);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    pageStyle: receiptPageStyle,
    onAfterPrint: () => {
      window.setTimeout(() => {
        void cutReceiptPaper(token, restaurant);
      }, cutDelayMs);
    }
  });

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(receipt.qrPayload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 190,
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    }).then((url) => {
      if (!cancelled) setQrCodeUrl(url);
    }).catch(() => {
      if (!cancelled) setQrCodeUrl("");
    });

    return () => {
      cancelled = true;
    };
  }, [receipt.qrPayload]);

  function printReceipt() {
    handlePrint();
  }

  return (
    <>
      <AppButton
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={printReceipt}
        iconStart={<Printer className="h-4 w-4" />}
      >
        طباعة
      </AppButton>
      <div ref={printRef} className="receipt-print-source" aria-hidden="true">
        <article className="thermal-receipt">
          <header className="receipt-header">
            <h1>{receipt.restaurantName}</h1>
            {receipt.location ? <p>{receipt.location}</p> : null}
            {receipt.vatNumber ? <p className="receipt-vat">VAT # {receipt.vatNumber}</p> : null}
            <div className="receipt-title">
              <p>فاتورة ضريبية مبسطة</p>
              <p>Simplified Tax Invoice</p>
            </div>
            <p className="receipt-meta">
              <span>رقم الفاتورة :</span>
              <strong>{receipt.invoiceNo}</strong>
              <span>Invoice No :</span>
            </p>
            <p className="receipt-meta">
              <span>تاريخ الفاتورة :</span>
              <strong>{receipt.invoiceDateTime}</strong>
              <span>Invoice Date :</span>
            </p>
            <p className="receipt-submeta">فتح الفاتورة : {receipt.invoiceDateTime}</p>
            <p className="receipt-sale-label">{receipt.saleLabel}</p>
          </header>

          <table className="receipt-items">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>البيان</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={`${item.menuItemId}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{formatQuantity(item.quantity)}</td>
                  <td>{formatLineAmount(item.unitPrice)}</td>
                  <td>{item.name}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="receipt-totals" dir="ltr">
            <ReceiptTotal label="الإجمالي قبل الضريبة" currency={receipt.currency} amount={receipt.baseAmount} />
            <ReceiptTotal label="ضريبة الإنفاق الاستهلاكي" currency={receipt.currency} amount={receipt.consumerTax} />
            <ReceiptTotal label="ضريبة إدارة محلية" currency={receipt.currency} amount={receipt.localAdminTax} />
            <ReceiptTotal label="اجمالي المبلغ المستحق" currency={receipt.currency} amount={receipt.payableAmount} strong />
          </section>

          <div className="receipt-qr">
            {qrCodeUrl ? <img src={qrCodeUrl} alt="Invoice QR" /> : null}
          </div>
        </article>
      </div>
    </>
  );
}

async function cutReceiptPaper(token: string | undefined, restaurant: Restaurant | null) {
  if (!token || !restaurant?.receiptPrinterIp?.trim()) return;

  try {
    await adminRequest("/api/owner/receipt-printer/cut", token, {
      method: "POST",
      body: JSON.stringify({})
    });
  } catch (error) {
    console.warn("Receipt printer cut command failed", error);
  }
}

function ReceiptTotal({ label, currency, amount, strong = false }: { label: string; currency: string; amount: number; strong?: boolean }) {
  return (
    <div className={strong ? "receipt-total receipt-total-strong" : "receipt-total"}>
      <span className="receipt-total-label">{label}</span>
      <span className="receipt-total-amount">{formatReceiptAmount(amount)}</span>
      <span className="receipt-total-currency">{currency}</span>
    </div>
  );
}

function buildReceipt(order: OpsOrder, restaurant: Restaurant | null, table?: OpsTable | null) {
  const baseAmount = Math.max(numberValue(order.subTotal) - numberValue(order.discount), 0);
  const consumerTax = baseAmount * CONSUMER_TAX_RATE;
  const localAdminTax = baseAmount * LOCAL_ADMIN_TAX_RATE;
  const payableAmount = Math.round(baseAmount + consumerTax + localAdminTax);
  const restaurantName = restaurant?.receiptRestaurantName?.trim() || restaurant?.name?.trim() || "المطعم";
  const vatNumber = restaurant?.vatNumber?.trim() || DEFAULT_VAT_NUMBER;
  const invoiceNo = compactOrderInvoiceNo(order.id);
  const invoiceDateTime = formatReceiptDateTime(order.updatedAt || order.orderedAt || order.createdAt);
  const currency = normalizeReceiptCurrency(restaurant?.currency);
  const saleLabel = table?.name ? `مبيعات نقدية ط ${table.name}` : "مبيعات نقدية";

  const summary = {
    restaurantName,
    vatNumber,
    invoiceNo,
    invoiceDateTime,
    baseAmount: Math.round(baseAmount),
    consumerTax: Math.round(consumerTax),
    localAdminTax: Math.round(localAdminTax),
    payableAmount,
    currency
  };

  return {
    restaurantName,
    location: restaurant?.receiptLocation?.trim() || "",
    vatNumber,
    invoiceNo,
    invoiceDateTime,
    saleLabel,
    currency,
    baseAmount,
    consumerTax,
    localAdminTax,
    payableAmount,
    qrPayload: JSON.stringify(summary)
  };
}

function compactOrderInvoiceNo(orderId: string) {
  const value = String(orderId || "").trim();
  const withoutOrderPrefix = value.replace(/^order[_-]?/i, "");
  return (withoutOrderPrefix || value || "00000").slice(0, 5);
}

function formatReceiptDateTime(value: string | undefined) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function formatLineAmount(value: number) {
  return numberValue(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatReceiptAmount(value: number) {
  return String(Math.round(numberValue(value)));
}

function formatQuantity(value: number) {
  return String(Math.round(numberValue(value)));
}

function normalizeReceiptCurrency(currency: string | undefined) {
  const value = currency?.trim();
  if (!value || value.toUpperCase() === "SYP") return "SP";
  return value;
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
