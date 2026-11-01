import type { Diagram, DiagramEdge, DiagramNode, TemplateSummary } from "../types";

const node = (id: string, type: string, label: string, x: number, y: number, config: Record<string, unknown>): DiagramNode => ({
  id,
  type,
  label,
  position: { x, y },
  config,
});
const edge = (id: string, source: string, target: string, handle: string | null = null): DiagramEdge => ({
  id,
  source,
  target,
  source_handle: handle,
});

const onlineShop: Diagram = {
  schema_version: "1",
  name: "Online shop",
  nodes: [
    node("customer", "entity", "Customer", 0, 0, {
      name: "Customer",
      fields: [
        { name: "name", type: "string", required: true },
        { name: "phone", type: "string", required: true },
      ],
    }),
    node("order", "entity", "Order", 0, 140, {
      name: "Order",
      fields: [
        { name: "total", type: "number", required: true },
        { name: "phone", type: "string", required: true },
        { name: "status", type: "string", required: false },
        { name: "customer", type: "foreign_key", required: false, target: "Customer", on_delete: "cascade" },
      ],
    }),
    node("ev", "event", "Order placed", 290, 140, { name: "order_placed", entity: "Order" }),
    node("big", "condition", "Big order?", 580, 140, { field: "total", operator: "gte", value: "10000" }),
    node("charge", "charge_payment", "Take payment", 870, 40, { provider: "paystack", amount_field: "total" }),
    node("paid", "update_status", "Mark paid", 1160, 40, { status: "paid" }),
    node("sms", "send_sms", "Confirm by SMS", 1450, 40, { to_field: "phone", message: "Thanks! Your order of ₦{total} is confirmed." }),
    node("review", "update_status", "Needs review", 870, 240, { status: "pending_review" }),
  ],
  edges: [
    edge("e1", "order", "ev"),
    edge("e2", "ev", "big"),
    edge("e3", "big", "charge", "true"),
    edge("e4", "charge", "paid"),
    edge("e5", "paid", "sms"),
    edge("e6", "big", "review", "false"),
  ],
};

const booking: Diagram = {
  schema_version: "1",
  name: "Appointment booking",
  nodes: [
    node("staff", "actor", "Receptionist", 0, 0, { name: "Receptionist", permissions: ["book", "cancel"] }),
    node("appt", "entity", "Appointment", 0, 140, {
      name: "Appointment",
      fields: [
        { name: "client_name", type: "string", required: true },
        { name: "phone", type: "string", required: true },
        { name: "starts_at", type: "datetime", required: true },
        { name: "status", type: "string", required: false },
      ],
    }),
    node("booked", "event", "Appointment booked", 290, 70, { name: "appointment_booked", entity: "Appointment" }),
    node("confirm", "update_status", "Confirm", 580, 70, { status: "confirmed" }),
    node("sms", "send_sms", "Text the client", 870, 70, { to_field: "phone", message: "Hi {client_name}, your appointment is booked for {starts_at}." }),
    node("cancelled", "event", "Appointment cancelled", 290, 240, { name: "appointment_cancelled", entity: "Appointment" }),
    node("cancel", "update_status", "Cancel", 580, 240, { status: "cancelled" }),
  ],
  edges: [
    edge("e1", "staff", "booked"),
    edge("e2", "appt", "booked"),
    edge("e3", "booked", "confirm"),
    edge("e4", "confirm", "sms"),
    edge("e5", "appt", "cancelled"),
    edge("e6", "cancelled", "cancel"),
  ],
};

const stock: Diagram = {
  schema_version: "1",
  name: "Stock alerts",
  nodes: [
    node("product", "entity", "Product", 0, 100, {
      name: "Product",
      fields: [
        { name: "name", type: "string", required: true },
        { name: "stock", type: "integer", required: true },
        { name: "supplier_email", type: "string", required: true },
        { name: "status", type: "string", required: false },
      ],
    }),
    node("ev", "event", "Stock updated", 290, 100, { name: "stock_updated", entity: "Product" }),
    node("low", "condition", "Running low?", 580, 100, { field: "stock", operator: "lte", value: "5" }),
    node("mail", "send_email", "Email supplier", 870, 20, {
      to_field: "supplier_email",
      subject: "Low stock",
      message: "{name} is running low ({stock} left).",
    }),
    node("ok", "update_status", "Stock is fine", 870, 200, { status: "in_stock" }),
  ],
  edges: [
    edge("e1", "product", "ev"),
    edge("e2", "ev", "low"),
    edge("e3", "low", "mail", "true"),
    edge("e4", "low", "ok", "false"),
  ],
};

const ENTRIES: { summary: TemplateSummary; diagram: Diagram }[] = [
  { summary: { id: "online-shop", name: "Online shop", description: "Orders, payment by Paystack, and an SMS confirmation." }, diagram: onlineShop },
  { summary: { id: "appointment-booking", name: "Appointment booking", description: "Book and cancel appointments, with a text to the client." }, diagram: booking },
  { summary: { id: "stock-alerts", name: "Stock alerts", description: "Email a supplier when a product runs low." }, diagram: stock },
];

export const TEMPLATE_LIST: TemplateSummary[] = ENTRIES.map((e) => e.summary);

export const templateDiagram = (id: string): Diagram | null => {
  const found = ENTRIES.find((e) => e.summary.id === id);
  return found ? structuredClone(found.diagram) : null;
};
