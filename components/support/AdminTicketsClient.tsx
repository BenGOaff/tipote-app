"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Loader2, MessageCircle, Mail, Clock, CheckCircle2,
  Send, Trash2, ChevronDown, ChevronRight, XCircle,
  User, Bot, Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* ────────────────── Types ────────────────── */

type TicketMessage = {
  role: "user" | "assistant";
  content: string;
};

type Ticket = {
  id: string;
  email: string;
  name: string | null;
  subject: string | null;
  conversation: TicketMessage[];
  status: "open" | "replied" | "closed";
  admin_reply: string | null;
  replied_at: string | null;
  locale: string;
  created_at: string;
};

const STATUS_CONFIG = {
  open: { labelKey: "statusOpen", color: "bg-amber-100 text-amber-700", icon: Clock },
  replied: { labelKey: "statusReplied", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  closed: { labelKey: "statusClosed", color: "bg-gray-100 text-gray-500", icon: Archive },
};

/* ────────────────── Component ────────────────── */

export default function AdminTicketsClient() {
  const t = useTranslations("adminTickets");
  const locale = useLocale();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/support/tickets?${params}`);
      const data = await res.json();
      if (data.ok) {
        setTickets(data.tickets);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleReply = async (ticket: Ticket) => {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      const res = await fetch("/api/admin/support/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ticket.id,
          admin_reply: replyText.trim(),
          email: ticket.email,
          name: ticket.name,
          subject: ticket.subject,
          locale: ticket.locale,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setReplyText("");
        setExpandedId(null);
        fetchTickets();
      }
    } finally {
      setReplying(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    await fetch("/api/admin/support/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchTickets();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/admin/support/tickets?id=${id}`, { method: "DELETE" });
    fetchTickets();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openCount = tickets.filter((t) => t.status === "open").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("heading")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("totalTickets", { n: total })}
            {statusFilter === "open" && openCount > 0 && (
              <span className="ml-1 text-amber-600 font-medium">
                — {t("pending", { n: openCount })}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {[
          { key: "open", label: t("tabOpen") },
          { key: "replied", label: t("tabReplied") },
          { key: "closed", label: t("tabClosed") },
          { key: "", label: t("tabAll") },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              statusFilter === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tickets list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("noTickets")} {statusFilter === "open" ? t("noTicketsPending") : ""}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => {
            const isExpanded = expandedId === ticket.id;
            const cfg = STATUS_CONFIG[ticket.status];
            const StatusIcon = cfg.icon;
            const lastUserMsg = [...ticket.conversation].reverse().find((m) => m.role === "user");

            return (
              <Card key={ticket.id} className="overflow-hidden">
                {/* Ticket row */}
                <button
                  onClick={() => {
                    setExpandedId(isExpanded ? null : ticket.id);
                    setReplyText(ticket.admin_reply || "");
                  }}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm text-foreground truncate">
                        {ticket.name || ticket.email}
                      </span>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", cfg.color)}>
                        <StatusIcon className="w-3 h-3 mr-0.5" />
                        {t(cfg.labelKey as any)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 uppercase">
                        {ticket.locale}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {ticket.subject || lastUserMsg?.content || ticket.email}
                    </p>
                  </div>

                  <div className="text-xs text-muted-foreground shrink-0">
                    {formatDate(ticket.created_at)}
                  </div>
                </button>

                {/* Expanded: conversation + reply */}
                {isExpanded && (
                  <CardContent className="border-t border-border/50 px-4 py-4 space-y-4">
                    {/* Visitor info */}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" />
                        <a href={`mailto:${ticket.email}`} className="text-primary hover:underline">
                          {ticket.email}
                        </a>
                      </div>
                      {ticket.name && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <User className="w-3.5 h-3.5" />
                          {ticket.name}
                        </div>
                      )}
                    </div>

                    {/* Conversation */}
                    <div className="bg-muted/30 rounded-xl p-3 space-y-2 max-h-64 overflow-y-auto">
                      {ticket.conversation.map((msg, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-start gap-2",
                            msg.role === "user" && "flex-row-reverse",
                          )}
                        >
                          <div
                            className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                              msg.role === "assistant" ? "bg-accent" : "bg-primary/10",
                            )}
                          >
                            {msg.role === "assistant" ? (
                              <Bot className="w-3 h-3 text-primary" />
                            ) : (
                              <User className="w-3 h-3 text-primary" />
                            )}
                          </div>
                          <div
                            className={cn(
                              "rounded-xl px-3 py-2 max-w-[80%] text-xs leading-relaxed",
                              msg.role === "assistant"
                                ? "bg-background text-foreground"
                                : "bg-primary/10 text-foreground",
                            )}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Previous admin reply */}
                    {ticket.admin_reply && ticket.status === "replied" && (
                      <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {t("repliedOn", { date: ticket.replied_at ? formatDate(ticket.replied_at) : "—" })}
                        </p>
                        <p className="text-sm text-green-900 whitespace-pre-wrap">
                          {ticket.admin_reply}
                        </p>
                      </div>
                    )}

                    {/* Reply form */}
                    <div className="space-y-2">
                      <Textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={t("replyPh")}
                        rows={3}
                        className="text-sm resize-none"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleReply(ticket)}
                          disabled={!replyText.trim() || replying}
                          size="sm"
                          className="gap-1.5"
                        >
                          {replying ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          {t("replyAndSend")}
                        </Button>

                        {ticket.status !== "closed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(ticket.id, "closed")}
                            className="gap-1.5 text-muted-foreground"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {t("close")}
                          </Button>
                        )}

                        {ticket.status === "closed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(ticket.id, "open")}
                            className="gap-1.5 text-muted-foreground"
                          >
                            {t("reopen")}
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(ticket.id)}
                          className="gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
