"use client";

import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { AppButton } from "@/components/shared";
import type { Restaurant } from "@/types/menu";
import type { Invoice } from "@/types/ops";
import type { LocalInvoice } from "@/offline/schema";
import { buildReceipt, type ReceiptInvoiceSnapshot } from "./receipt";

const receiptPageStyle = `
  @page { size: 80mm auto; margin: 0; }
  body {
    width: 80mm;
    margin: 0;
    padding: 0 0 20px;
    background: #ffffff;
    color: #000000;
    font-family: Arial, Tahoma, sans-serif;
    font-size: 12px;
  }
  * { box-sizing: border-box; }
  table { width: 100%; border-collapse: collapse; }
  td, th {
    padding: 2px;
    font-weight: bold;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: normal;
    text-align: center;
  }
  .receipt-print-source {
    position: static !important;
    width: 80mm !important;
    max-width: 80mm !important;
    margin: 0 !important;
    padding: 0 !important;
    opacity: 1 !important;
    overflow: visible !important;
  }
  .thermal-receipt {
    width: 80mm !important;
    max-width: 80mm !important;
    margin: 0 !important;
    padding: 16mm 4mm 8mm !important;
    background: #ffffff !important;
    color: #000000 !important;
  }
  .receipt-meta {
    display: grid;
    grid-template-columns: 18mm minmax(0, 1fr) 18mm !important;
    gap: 2px;
  }
  .receipt-confirmation-status {
    margin: 4px 0;
    font-size: 11px;
    font-weight: bold;
    text-align: center;
  }
`;

export function InvoiceReceiptPrintButton({
  invoice,
  restaurant,
  disabled = false
}: {
  invoice: LocalInvoice;
  restaurant: Restaurant | null;
  disabled?: boolean;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const receipt = useMemo(() => buildReceipt(orderFromInvoice(invoice), restaurant, null, invoice as ReceiptInvoiceSnapshot), [invoice, restaurant]);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    pageStyle: receiptPageStyle
  });

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(receipt.qrPayload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 190,
      color: { dark: "#000000", light: "#ffffff" }
    }).then((url) => {
      if (!cancelled) setQrCodeUrl(url);
    }).catch(() => {
      if (!cancelled) setQrCodeUrl("");
    });

    return () => {
      cancelled = true;
    };
  }, [receipt.qrPayload]);

  return (
    <>
      <AppButton
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || !invoice.items.length}
        onClick={() => handlePrint()}
        iconStart={<Printer className="h-4 w-4" />}
      >
        طباعة
      </AppButton>
      <div ref={printRef} className="receipt-print-source" aria-hidden="true">
        <article className="thermal-receipt">
          <header>
            <h1>{receipt.restaurantName}</h1>
            {receipt.location ? <p>{receipt.location}</p> : null}
            {receipt.vatNumber ? <p>VAT # {receipt.vatNumber}</p> : null}
            <div>
              <p>فاتورة ضريبية مبسطة</p>
              <p>Simplified Tax Invoice</p>
            </div>
            <p className="receipt-confirmation-status">{receipt.confirmationStatus}</p>
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
            <p>فتح الفاتورة : {receipt.invoiceDateTime}</p>
            <p>{receipt.saleLabel}</p>
          </header>

          <table>
            <thead>
              <tr>
                <th>الرقم</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>البيان</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item, index) => (
                <tr key={`${item.id}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{Math.round(numberValue(item.quantity))}</td>
                  <td>{formatLineAmount(item.unitPrice)}</td>
                  <td>{item.name}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section dir="ltr">
            <ReceiptTotal label="الإجمالي قبل الضريبة" currency={receipt.currency} amount={receipt.baseAmount} />
            <ReceiptTotal label="ضريبة الإنفاق الاستهلاكي" currency={receipt.currency} amount={receipt.consumerTax} />
            <ReceiptTotal label="ضريبة إدارة محلية" currency={receipt.currency} amount={receipt.localAdminTax} />
            <ReceiptTotal label="اجمالي المبلغ المستحق" currency={receipt.currency} amount={receipt.payableAmount} />
            <ReceiptTotal label="المدفوع" currency={receipt.currency} amount={receipt.paidAmount} />
            <ReceiptTotal label="المتبقي" currency={receipt.currency} amount={receipt.remainingAmount} />
          </section>

          {qrCodeUrl ? <img src={qrCodeUrl} alt="Invoice QR" /> : null}
        </article>
      </div>
    </>
  );
}

function ReceiptTotal({ label, currency, amount }: { label: string; currency: string; amount: number }) {
  return (
    <div>
      <span>{label}</span>{" "}
      <strong>{Math.round(numberValue(amount))}</strong>{" "}
      <span>{currency}</span>
    </div>
  );
}

function orderFromInvoice(invoice: Invoice) {
  return {
    id: invoice.orderId || invoice.id,
    name: invoice.orderId || invoice.id,
    tableId: "",
    type: "DINE_IN" as const,
    source: "POS" as const,
    status: invoice.status === "VOID" ? "CANCELLED" as const : "COMPLETED" as const,
    items: invoice.items.map((item) => ({
      menuItemId: item.itemId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      notes: "",
      modifiers: [],
      total: item.total
    })),
    subTotal: invoice.subTotal,
    discount: invoice.discount,
    tax: invoice.tax,
    serviceCharge: invoice.serviceCharge,
    total: invoice.total,
    paidAmount: invoice.paidAmount,
    paymentStatus: invoice.status === "PAID" ? "PAID" as const : invoice.status === "PARTIAL" ? "PARTIAL" as const : "UNPAID" as const,
    paymentMethod: invoice.paymentMethod,
    notes: invoice.notes,
    orderedAt: invoice.createdAt,
    invoiceId: invoice.id,
    paymentId: "",
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt
  };
}

function formatLineAmount(value: number) {
  return numberValue(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
