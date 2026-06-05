import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { sisdefWs, type WsEvent } from "@/lib/ws";

// ---------- Types ----------

export type LogLevel = "info" | "ok" | "warn" | "err" | "tx" | "rx";
interface LogEntry   { id: string; ts: string; level: LogLevel; text: string }
interface InboxEntry {
  id: string; ts: string; from: string;
  status: "ok" | "tampered" | "revoked" | "unknown-sender" | "error";
  plaintext?: string; detail?: string;
}
interface TrustedKey {
  id_unidade: string; chave_publica_rsa: string;
  chave_publica_ecdsa: string; ultima_atualizacao: string;
}

function uid() { return Math.random().toString(36).slice(2, 10) }
function now() { return new Date().toISOString().slice(11, 19) }

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: "#4a6275", ok: "#00e676", warn: "#ffab00",
  err: "#f44336", tx: "#00bcd4", rx: "#7c4dff",
};
const LEVEL_TAG: Record<LogLevel, string> = {
  info: "INFO", ok: " OK ", warn: "WARN", err: "ERR ", tx: " TX ", rx: " RX ",
};

// =============================================================
// SETUP SCREEN
// =============================================================

function SetupScreen({ onReady }: { onReady: (id: string) => void }) {
  const [unitId, setUnitId]   = useState("");
  const [busy, setBusy]       = useState(false);
  const [dots, setDots]       = useState(".");

  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 500);
    return () => clearInterval(t);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const clean = unitId.toLowerCase().trim();
    if (!/^[a-z0-9-]+$/.test(clean)) {
      toast.error("ID inválido — minúsculas, números e hífens");
      return;
    }
    setBusy(true);
    try {
      await api.identity.create(clean);
      toast.success(`Identidade ${clean} estabelecida`);
      onReady(clean);
    } catch (err) {
      toast.error(`FALHA: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 animate-flicker">

      {/* Classification banner */}
      <div className="classification w-full max-w-lg mb-6">
        TOP SECRET // SISDEF // CDCiber // CANAL CCU
      </div>

      <div className="panel w-full max-w-lg">

        {/* Header */}
        <div className="panel-header">
          <span className="flex items-center gap-2">
            <span className="led led-amber animate-pulse-amber" />
            IDENTIFICAÇÃO DA UNIDADE TÁTICA
          </span>
          <span>IFF SETUP</span>
        </div>

        <div className="p-6 space-y-6">

          {/* Logo / Title */}
          <div className="text-center space-y-1">
            <div style={{ color: "#00e676", fontSize: 11, letterSpacing: "0.25em" }}>
              ▓ SISTEMA INTEGRADO DE DEFESA DE FRONTEIRAS ▓
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#a8bfcc", letterSpacing: "0.1em" }}>
              SISDEF
            </div>
            <div style={{ fontSize: 10, color: "#4a6275", letterSpacing: "0.2em" }}>
              COMANDO DE DEFESA CIBERNÉTICA
            </div>
          </div>

          {/* Warning */}
          <div style={{
            border: "1px solid #ffab0060",
            background: "#ffab000a",
            borderRadius: 2,
            padding: "10px 12px",
          }}>
            <div style={{ color: "#ffab00", fontSize: 10, letterSpacing: "0.12em", marginBottom: 4 }}>
              ⚠ ALERTA DE SEGURANÇA
            </div>
            <div style={{ color: "#7a8f9a", fontSize: 11, lineHeight: 1.6 }}>
              A entidade <span style={{ color: "#f44336" }}>SOMBRA</span> possui acesso de leitura ao
              broker público. Toda transmissão é obrigatoriamente cifrada com AES-256-GCM,
              assinada via ECDSA P-256 e autenticada por IFF.
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <div style={{ color: "#4a6275", fontSize: 10, letterSpacing: "0.15em", marginBottom: 6 }}>
                CODINOME DA UNIDADE
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#00e676", fontSize: 13 }}>›</span>
                <input
                  autoFocus
                  value={unitId}
                  onChange={e => setUnitId(e.target.value)}
                  placeholder="ut-zulu"
                  style={{ flex: 1, padding: "8px 10px" }}
                />
              </div>
              <div style={{ color: "#2a3f52", fontSize: 10, marginTop: 4 }}>
                publicado em sisdef/broadcast/chaves/&lt;id&gt;
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%",
                padding: "11px",
                background: busy ? "#00874a" : "#00e676",
                color: "#000",
                border: "none",
                borderRadius: 2,
                fontSize: 11,
                letterSpacing: "0.2em",
                fontFamily: "inherit",
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: 700,
                transition: "background 0.15s",
              }}
            >
              {busy ? `GERANDO CHAVES CRIPTOGRÁFICAS${dots}` : "▸▸▸  ATIVAR UNIDADE TÁTICA"}
            </button>
          </form>

          {/* Crypto info */}
          <div style={{
            borderTop: "1px solid #1c2a3a",
            paddingTop: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
          }}>
            {[
              { label: "SIGILO", value: "RSA-2048\nOAEP/SHA-256" },
              { label: "ASSINATURA", value: "ECDSA P-256\nSHA-256" },
              { label: "PAYLOAD", value: "AES-256\nGCM" },
            ].map(item => (
              <div key={item.label} style={{
                background: "#070a0e",
                border: "1px solid #1c2a3a",
                borderRadius: 2,
                padding: "8px 10px",
                textAlign: "center",
              }}>
                <div style={{ color: "#2a3f52", fontSize: 9, letterSpacing: "0.12em" }}>{item.label}</div>
                <div style={{ color: "#00e676", fontSize: 10, marginTop: 4, whiteSpace: "pre-line", lineHeight: 1.5 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="classification w-full max-w-lg mt-6">
        TODA TRANSMISSÃO É MONITORADA // PROTOCOLO CCU ATIVO
      </div>
    </div>
  );
}

// =============================================================
// DASHBOARD
// =============================================================

function Dashboard({ unitId, onReset }: { unitId: string; onReset: () => void }) {
  const [mqttState, setMqttState]   = useState<"online" | "offline" | "connecting">("connecting");
  const [trusted, setTrusted]       = useState<Record<string, TrustedKey>>({});
  const [revoked, setRevoked]       = useState<Record<string, { by: string; timestamp: string }>>({});
  const [logs, setLogs]             = useState<LogEntry[]>([]);
  const [inbox, setInbox]           = useState<InboxEntry[]>([]);
  const [target, setTarget]         = useState("oraculo");
  const [message, setMessage]       = useState(`{"id_unidade":"${unitId}","cmd":"echo"}`);
  const [sending, setSending]       = useState(false);
  const [revokeTarget, setRevokeTarget] = useState("");
  const [clock, setClock]           = useState(now());
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setClock(now()), 1000);
    return () => clearInterval(t);
  }, []);

  function log(level: LogLevel, text: string) {
    setLogs(prev => [{ id: uid(), ts: now(), level, text }, ...prev].slice(0, 500));
  }

  useEffect(() => {
    api.trusted.list().then(setTrusted).catch(() => {});
    api.revocation.list().then(setRevoked).catch(() => {});
    api.status().then(s => setMqttState(s.mqtt === "online" ? "online" : "offline")).catch(() => {});

    sisdefWs.connect();
    const unsub = sisdefWs.subscribe(handleWsEvent);
    return () => { unsub(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleWsEvent(event: WsEvent) {
    switch (event.type) {
      case "init": {
        const e = event as { type: string; trusted: Record<string, TrustedKey>; revoked: Record<string, { by: string; timestamp: string }>; mqtt: string };
        setTrusted(e.trusted ?? {});
        setRevoked(e.revoked ?? {});
        setMqttState(e.mqtt === "online" ? "online" : "offline");
        log("ok", "Estado sincronizado com backend");
        break;
      }
      case "mqtt_status":
        setMqttState(String(event.state) === "online" ? "online" : "offline");
        log(String(event.state) === "online" ? "ok" : "warn", `MQTT ${event.state}`);
        break;
      case "iff_received":
        log("rx", `IFF recebido: ${event.unit} — chaves armazenadas`);
        api.trusted.list().then(setTrusted).catch(() => {});
        break;
      case "revocation_applied":
        log("warn", `🚫 REVOGAÇÃO: ${event.unit} (por ${event.by})`);
        toast.warning(`Unidade ${event.unit} revogada`);
        api.trusted.list().then(setTrusted).catch(() => {});
        api.revocation.list().then(setRevoked).catch(() => {});
        break;
      case "message_received": {
        const from   = String(event.from ?? "?");
        const status = String(event.status ?? "error") as InboxEntry["status"];
        setInbox(prev => [{
          id: uid(), ts: now(), from, status,
          plaintext: event.plaintext ? String(event.plaintext) : undefined,
          detail:    event.detail    ? String(event.detail)    : undefined,
        }, ...prev].slice(0, 100));
        if (status === "ok") log("rx", `Mensagem íntegra de ${from}`);
        else log("err", `Mensagem ${status} de ${from}: ${event.detail ?? ""}`);
        break;
      }
      case "log":
        log((event.level as LogLevel) ?? "info", String(event.text ?? ""));
        break;
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!target) { toast.error("Selecione um destinatário"); return; }
    setSending(true);
    try {
      await api.messages.send(target, message);
      log("tx", `Transmissão cifrada → ${target} (${message.length}B)`);
      toast.success(`Ordem transmitida → ${target}`);
    } catch (err) {
      toast.error((err as Error).message);
      log("err", `Falha TX: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(e: React.FormEvent) {
    e.preventDefault();
    const t = revokeTarget.toLowerCase().trim();
    if (!t || !window.confirm(`Confirmar revogação de ${t}?`)) return;
    try {
      await api.revocation.revoke(t);
      log("warn", `Revogação difundida: ${t}`);
      toast.success(`${t} revogada`);
      setRevokeTarget("");
      api.trusted.list().then(setTrusted).catch(() => {});
      api.revocation.list().then(setRevoked).catch(() => {});
    } catch (err) { toast.error((err as Error).message); }
  }

  async function handleForget(unit: string) {
    try {
      await api.trusted.forget(unit);
      api.trusted.list().then(setTrusted).catch(() => {});
      log("info", `Chave de ${unit} removida localmente`);
    } catch (err) { toast.error((err as Error).message); }
  }

  const trustedList = Object.values(trusted).sort((a, b) => a.id_unidade.localeCompare(b.id_unidade));
  const revokedList = Object.entries(revoked).map(([id, info]) => ({ id, ...info }));

  const mqttLed = mqttState === "online"
    ? "led led-green animate-pulse-green"
    : mqttState === "connecting"
    ? "led led-amber animate-blink"
    : "led led-red";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Classification bar */}
      <div className="classification animate-flicker">
        TOP SECRET // SISDEF // CDCiber // CANAL CCU — UNIDADE ATIVA: {unitId.toUpperCase()}
      </div>

      {/* Top Bar */}
      <header style={{
        background: "#0a0e15",
        borderBottom: "1px solid #1c2a3a",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
      }}>
        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={mqttLed} />
          <div>
            <div style={{ fontSize: 9, color: "#2a3f52", letterSpacing: "0.15em" }}>CANAL CCU</div>
            <div style={{ fontSize: 12, color: mqttState === "online" ? "#00e676" : mqttState === "connecting" ? "#ffab00" : "#f44336" }}>
              {mqttState === "online" ? "ONLINE · broker.hivemq.com" : mqttState === "connecting" ? "CONECTANDO..." : "OFFLINE"}
            </div>
          </div>
        </div>

        <div style={{ width: 1, height: 32, background: "#1c2a3a" }} />

        {/* Unit ID */}
        <div>
          <div style={{ fontSize: 9, color: "#2a3f52", letterSpacing: "0.15em" }}>UNIDADE TÁTICA</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#00e676", letterSpacing: "0.1em" }}>
            {unitId.toUpperCase()}
          </div>
        </div>

        <div style={{ width: 1, height: 32, background: "#1c2a3a" }} />

        {/* Network stats */}
        <div style={{ display: "flex", gap: 16 }}>
          <Stat label="REDE" value={`${trustedList.length} UTs`} color="#00e676" />
          <Stat label="INBOX" value={`${inbox.length} MSG`} color="#00bcd4" />
          <Stat label="REVOG" value={`${revokedList.length}`} color={revokedList.length > 0 ? "#f44336" : "#2a3f52"} />
        </div>

        {/* Clock */}
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 9, color: "#2a3f52", letterSpacing: "0.12em" }}>HORA ZULU</div>
          <div style={{ fontSize: 16, color: "#a8bfcc", fontVariantNumeric: "tabular-nums" }}>
            {clock}Z
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <TactBtn
            onClick={() => api.identity.publishIff().then(() => log("tx", "IFF republicado")).catch(() => {})}
            label="▸ IFF"
            color="#00bcd4"
          />
          <TactBtn
            onClick={() => { if (window.confirm("Apagar identidade e chaves locais?")) api.identity.delete().then(onReset).catch(() => {}); }}
            label="⨯ RESET"
            color="#f44336"
          />
        </div>
      </header>

      {/* Main Grid */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px 1fr 280px", gap: 1, background: "#1c2a3a", overflow: "hidden" }}>

        {/* ── LEFT: Network Roster ── */}
        <div style={{ background: "#0c1018", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="panel-header">
            <span><span className="led led-green" style={{ marginRight: 6 }} />REDE CONFIÁVEL</span>
            <span style={{ color: "#00e676" }}>{trustedList.length}</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {trustedList.map(t => {
              const isMe     = t.id_unidade === unitId;
              const isOracle = t.id_unidade === "oraculo";
              const selected = target === t.id_unidade;
              return (
                <div
                  key={t.id_unidade}
                  onClick={() => !isMe && setTarget(t.id_unidade)}
                  style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid #1c2a3a",
                    cursor: isMe ? "default" : "pointer",
                    background: selected ? "#001a0e" : "transparent",
                    borderLeft: selected ? "2px solid #00e676" : "2px solid transparent",
                    transition: "background 0.1s",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <span className={`led ${isOracle ? "led-amber" : isMe ? "led-cyan" : "led-green"}`} />
                      <span style={{ color: selected ? "#00e676" : "#a8bfcc" }}>
                        {t.id_unidade}
                      </span>
                      {isMe     && <Tag label="VOCÊ"    color="#00bcd4" />}
                      {isOracle && <Tag label="ORÁCULO" color="#ffab00" />}
                    </div>
                    <div style={{ fontSize: 9, color: "#2a3f52", marginTop: 2, paddingLeft: 14 }}>
                      {t.ultima_atualizacao === "briefing" ? "pré-carregada" : t.ultima_atualizacao.slice(11, 19) + "Z"}
                    </div>
                  </div>
                  {!isMe && !isOracle && (
                    <button
                      onClick={ev => { ev.stopPropagation(); handleForget(t.id_unidade); }}
                      style={{ background: "none", border: "none", color: "#2a3f52", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}
                      title="Remover localmente"
                    >⨯</button>
                  )}
                </div>
              );
            })}
            {trustedList.length === 0 && (
              <div style={{ padding: 16, fontSize: 10, color: "#2a3f52", textAlign: "center" }}>
                AGUARDANDO<br />BROADCASTS IFF<span className="animate-blink">_</span>
              </div>
            )}
          </div>

          {/* Revoked */}
          <div className="panel-header" style={{ borderTop: "1px solid #1c2a3a" }}>
            <span><span className="led led-red" style={{ marginRight: 6 }} />REVOGADAS</span>
            <span style={{ color: revokedList.length > 0 ? "#f44336" : "#2a3f52" }}>{revokedList.length}</span>
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {revokedList.length === 0
              ? <div style={{ padding: "10px 12px", fontSize: 10, color: "#2a3f52" }}>NENHUMA REVOGAÇÃO</div>
              : revokedList.map(r => (
                <div key={r.id} style={{ padding: "6px 12px", borderBottom: "1px solid #1c2a3a" }}>
                  <div style={{ fontSize: 11, color: "#f44336", display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="led led-red" />
                    {r.id.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 9, color: "#2a3f52", marginTop: 2 }}>
                    por {r.by} · {r.timestamp.slice(11, 19)}Z
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* ── CENTER ── */}
        <div style={{ background: "#070a0e", display: "flex", flexDirection: "column", gap: 1, overflow: "hidden" }}>

          {/* Compose */}
          <div style={{ background: "#0c1018", flex: "0 0 auto" }}>
            <div className="panel-header">
              <span><span className="led led-amber" style={{ marginRight: 6 }} />TRANSMISSÃO CIFRADA</span>
              <span>AES-256-GCM · RSA-OAEP · ECDSA</span>
            </div>
            <form onSubmit={handleSend} style={{ padding: 14 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-end" }}>
                <div style={{ flex: "0 0 180px" }}>
                  <div style={{ fontSize: 9, color: "#2a3f52", letterSpacing: "0.12em", marginBottom: 4 }}>DESTINATÁRIO</div>
                  <select
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                    style={{ width: "100%", padding: "7px 8px" }}
                  >
                    {trustedList.filter(t => t.id_unidade !== unitId).map(t => (
                      <option key={t.id_unidade} value={t.id_unidade}>{t.id_unidade}</option>
                    ))}
                  </select>
                </div>
                <div style={{ fontSize: 10, color: "#2a3f52", paddingBottom: 8 }}>
                  → <span style={{ color: "#00bcd4" }}>sisdef/direto/{target}</span>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, paddingBottom: 2 }}>
                  <TactBtn
                    onClick={() => { setTarget("oraculo"); setMessage(`{"id_unidade":"${unitId}","cmd":"echo"}`); }}
                    label="ECHO ORÁCULO"
                    color="#ffab00"
                    small
                  />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: "#2a3f52", letterSpacing: "0.12em", marginBottom: 4 }}>PAYLOAD</div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  style={{ width: "100%", padding: "8px 10px", resize: "vertical" }}
                />
              </div>
              <button
                type="submit"
                disabled={sending || mqttState !== "online"}
                style={{
                  padding: "9px 20px",
                  background: sending ? "#00874a" : "#00e676",
                  color: "#000",
                  border: "none",
                  borderRadius: 2,
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  fontFamily: "inherit",
                  fontWeight: 700,
                  cursor: sending || mqttState !== "online" ? "not-allowed" : "pointer",
                  opacity: mqttState !== "online" ? 0.4 : 1,
                }}
              >
                {sending ? "TRANSMITINDO..." : "▸ TRANSMITIR"}
              </button>
            </form>
          </div>

          {/* Inbox */}
          <div style={{ background: "#0c1018", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="panel-header">
              <span><span className="led led-cyan" style={{ marginRight: 6 }} />CAIXA DE ENTRADA</span>
              <span style={{ color: "#00bcd4" }}>sisdef/direto/{unitId}</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {inbox.length === 0
                ? (
                  <div style={{ padding: 32, textAlign: "center", color: "#2a3f52", fontSize: 11 }}>
                    AGUARDANDO ORDENS NO CANAL DIRETO
                    <span className="animate-blink">_</span>
                  </div>
                )
                : inbox.map(m => (
                  <div key={m.id} className="animate-scan-in" style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid #1c2a3a",
                    borderLeft: `3px solid ${STATUS_COLOR[m.status]}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <InboxBadge status={m.status} />
                      <span style={{ fontSize: 10, color: "#4a6275" }}>{m.ts}Z</span>
                      <span style={{ fontSize: 11, color: "#00bcd4" }}>FROM: {m.from}</span>
                    </div>
                    {m.plaintext && (
                      <pre style={{
                        margin: 0,
                        fontSize: 12,
                        color: "#a8bfcc",
                        background: "#070a0e",
                        border: "1px solid #1c2a3a",
                        borderRadius: 2,
                        padding: "8px 10px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                      }}>
                        {m.plaintext}
                      </pre>
                    )}
                    {m.detail && (
                      <div style={{ fontSize: 10, color: "#ffab00", marginTop: 4 }}>
                        ⚠ {m.detail}
                      </div>
                    )}
                  </div>
                ))
              }
            </div>
          </div>

          {/* Revoke */}
          <div style={{ background: "#0c1018", flex: "0 0 auto" }}>
            <div className="panel-header" style={{ borderTop: "1px solid #1c2a3a" }}>
              <span><span className="led led-red" style={{ marginRight: 6 }} />REVOGAÇÃO DE ACESSO</span>
              <span>broadcast assinado · ECDSA</span>
            </div>
            <form onSubmit={handleRevoke} style={{ padding: 12, display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "#2a3f52", letterSpacing: "0.12em", marginBottom: 4 }}>
                  UNIDADE COMPROMETIDA
                </div>
                <input
                  value={revokeTarget}
                  onChange={e => setRevokeTarget(e.target.value)}
                  placeholder="ut-charlie"
                  style={{ width: "100%", padding: "7px 10px" }}
                />
              </div>
              <button
                type="submit"
                disabled={!revokeTarget || mqttState !== "online"}
                style={{
                  alignSelf: "flex-end",
                  padding: "8px 14px",
                  background: "#f44336",
                  color: "#fff",
                  border: "none",
                  borderRadius: 2,
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  fontFamily: "inherit",
                  fontWeight: 700,
                  cursor: !revokeTarget || mqttState !== "online" ? "not-allowed" : "pointer",
                  opacity: !revokeTarget || mqttState !== "online" ? 0.4 : 1,
                }}
              >
                🚫 REVOGAR
              </button>
            </form>
          </div>
        </div>

        {/* ── RIGHT: Ops Log ── */}
        <div style={{ background: "#0c1018", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="panel-header">
            <span><span className="led led-amber animate-blink" style={{ marginRight: 6 }} />LOG DE OPERAÇÕES</span>
            <button
              onClick={() => setLogs([])}
              style={{ background: "none", border: "none", color: "#2a3f52", cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}
            >
              LIMPAR
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {logs.length === 0
              ? <div style={{ padding: 16, fontSize: 10, color: "#2a3f52" }}>SEM EVENTOS</div>
              : logs.map(l => (
                <div key={l.id} style={{
                  display: "flex",
                  gap: 6,
                  padding: "2px 10px",
                  fontSize: 10,
                  lineHeight: 1.7,
                  borderBottom: "1px solid #0e1520",
                }}>
                  <span style={{ color: "#2a3f52", flexShrink: 0 }}>{l.ts}</span>
                  <span style={{
                    color: LEVEL_COLOR[l.level],
                    flexShrink: 0,
                    fontWeight: 700,
                  }}>
                    [{LEVEL_TAG[l.level]}]
                  </span>
                  <span style={{ color: "#7a8f9a", wordBreak: "break-all" }}>{l.text}</span>
                </div>
              ))
            }
            <div ref={logEndRef} />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        background: "#0a0e15",
        borderTop: "1px solid #1c2a3a",
        padding: "4px 16px",
        display: "flex",
        justifyContent: "space-between",
        fontSize: 9,
        color: "#2a3f52",
        letterSpacing: "0.1em",
      }}>
        <span>SISDEF v1.0 // CDCiber · AES-256-GCM / RSA-OAEP / ECDSA P-256</span>
        <span>{new Date().toISOString().slice(0, 10)} // PROTOCOLO CCU ATIVO</span>
      </div>
    </div>
  );
}

// =============================================================
// Helper components
// =============================================================

const STATUS_COLOR: Record<InboxEntry["status"], string> = {
  ok:               "#00e676",
  tampered:         "#f44336",
  revoked:          "#f44336",
  "unknown-sender": "#ffab00",
  error:            "#f44336",
};

const STATUS_LABEL: Record<InboxEntry["status"], string> = {
  ok:               "✓ ÍNTEGRA",
  tampered:         "⚠ ADULTERADA",
  revoked:          "🚫 REVOGADA",
  "unknown-sender": "? SEM IFF",
  error:            "✗ ERRO",
};

function InboxBadge({ status }: { status: InboxEntry["status"] }) {
  const color = STATUS_COLOR[status];
  return (
    <span style={{
      fontSize: 9,
      padding: "2px 6px",
      border: `1px solid ${color}60`,
      background: `${color}12`,
      color,
      borderRadius: 2,
      letterSpacing: "0.12em",
      fontWeight: 700,
    }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 8,
      padding: "1px 4px",
      border: `1px solid ${color}50`,
      color,
      borderRadius: 2,
      letterSpacing: "0.1em",
    }}>
      {label}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#2a3f52", letterSpacing: "0.12em" }}>{label}</div>
      <div style={{ fontSize: 13, color, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function TactBtn({ onClick, label, color, small }: { onClick: () => void; label: string; color: string; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: `1px solid ${color}60`,
        color,
        padding: small ? "4px 8px" : "6px 12px",
        borderRadius: 2,
        fontSize: small ? 9 : 10,
        letterSpacing: "0.12em",
        fontFamily: "inherit",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = `${color}18`)}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );
}

// =============================================================
// ROOT
// =============================================================

export default function SisdefApp() {
  const [unitId, setUnitId]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.identity.get()
      .then(id => setUnitId(id.id_unidade))
      .catch(() => setUnitId(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#2a3f52" }}>
        INICIALIZANDO SISDEF<span className="animate-blink">_</span>
      </div>
    );
  }

  if (!unitId) return <SetupScreen onReady={setUnitId} />;
  return <Dashboard unitId={unitId} onReset={() => setUnitId(null)} />;
}
