"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { cn } from "@/lib/utils";
import {
  User,
  Bot,
  FileText,
  Search,
  FolderSearch,
  Terminal,
  Loader2,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  MessageSquare,
  GitBranch,
  AlertCircle,
  Brain,
  Layers,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { MermaidDiagram } from "./mermaid-diagram";
import type {
  ChatMessage,
  ToolActivity,
  UsageInfo,
  SubAgentActivity,
  OrchestratorPhaseType,
} from "@/hooks/useChat";
import { AttachmentPreview } from "./attachment-preview";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  // Skip standalone tool messages (now embedded in assistant messages)
  if (message.role === "tool") return null;

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] rounded-lg message-content",
          isUser
            ? "bg-primary text-primary-foreground px-4 py-2"
            : "space-y-2"
        )}
      >
        {isUser ? (
          <div>
            {message.attachments && message.attachments.length > 0 && (
              <div className="mb-2">
                <AttachmentPreview attachments={message.attachments} compact />
              </div>
            )}
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          </div>
        ) : (
          <>
            {/* Thinking indicator */}
            {message.isStreaming && !message.content && !message.orchestratorPhase && (
              <ThinkingIndicator />
            )}

            {/* Orchestrator progress */}
            {(message.orchestratorPhase || message.subAgentActivities?.length) && (
              <OrchestratorProgress
                phase={message.orchestratorPhase}
                subAgentActivities={message.subAgentActivities}
                isStreaming={message.isStreaming}
                currentIteration={message.currentIteration}
                maxIterations={message.maxIterations}
              />
            )}

            {/* Tool activities panel (orchestrator's own tools, e.g. in synthesis) */}
            {message.toolActivities && message.toolActivities.length > 0 && (
              <ToolActivitiesPanel
                activities={message.toolActivities}
                isStreaming={message.isStreaming}
              />
            )}

            {/* Assistant text content */}
            {message.content && (
              <div className="rounded-lg bg-muted px-4 py-2">
                <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || "");
                        const lang = match?.[1];
                        const codeString = String(children).replace(/\n$/, "");

                        if (lang === "mermaid") {
                          return <MermaidDiagram chart={codeString} isStreaming={message.isStreaming} />;
                        }

                        if (lang) {
                          return (
                            <SyntaxHighlighter
                              style={oneDark}
                              language={lang}
                              PreTag="div"
                              customStyle={{
                                margin: 0,
                                borderRadius: "0.5rem",
                                fontSize: "0.85em",
                              }}
                            >
                              {codeString}
                            </SyntaxHighlighter>
                          );
                        }

                        if (className) {
                          return (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        }

                        return (
                          <code {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  {message.isStreaming && (
                    <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current" />
                  )}
                </div>
              </div>
            )}

            {/* Streaming indicator - shown when content is flowing */}
            {message.isStreaming && message.content && (
              <StreamingIndicator />
            )}

            {/* Usage summary */}
            {!message.isStreaming && message.usage && (
              <UsageSummary usage={message.usage} />
            )}
          </>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

/** Animated thinking indicator */
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>思考中...</span>
      <span className="flex gap-0.5">
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
      </span>
    </div>
  );
}

/** Streaming indicator - shown when content is actively streaming */
function StreamingIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>回應中...</span>
    </div>
  );
}

// ─── Orchestrator Progress ───────────────────────────────────────────

const PHASE_CONFIG: Record<string, { icon: typeof Brain; label: string; color: string }> = {
  planning: { icon: Brain, label: "分析問題中...", color: "text-blue-500" },
  execution: { icon: Layers, label: "Repo Agent 執行中...", color: "text-amber-500" },
  reflection: { icon: Search, label: "反思評估中...", color: "text-teal-500" },
  synthesis: { icon: Sparkles, label: "綜合結果中...", color: "text-purple-500" },
};

function IterationIndicator({
  current,
  max,
}: {
  current: number;
  max: number;
}) {
  if (max <= 1) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/40">
      <span className="font-medium">迭代 {current}/{max}</span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/60 rounded-full transition-all duration-500"
          style={{ width: `${(current / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

function OrchestratorProgress({
  phase,
  subAgentActivities,
  isStreaming,
  currentIteration,
  maxIterations,
}: {
  phase?: OrchestratorPhaseType;
  subAgentActivities?: SubAgentActivity[];
  isStreaming?: boolean;
  currentIteration?: number;
  maxIterations?: number;
}) {
  const hasActivities = subAgentActivities && subAgentActivities.length > 0;

  return (
    <div className="rounded-lg border border-border/60 bg-card text-xs space-y-0">
      {/* Iteration progress */}
      {currentIteration && maxIterations && (
        <IterationIndicator current={currentIteration} max={maxIterations} />
      )}

      {/* Phase indicator */}
      {phase && (
        <PhaseIndicator phase={phase} />
      )}

      {/* Sub-agent panels */}
      {hasActivities && (
        <div className="divide-y divide-border/40">
          {subAgentActivities.map((sa) => (
            <SubAgentPanel
              key={sa.repoId}
              activity={sa}
              isStreaming={isStreaming}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PhaseIndicator({ phase }: { phase: string }) {
  const config = PHASE_CONFIG[phase];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-2 px-3 py-2", config.color)}>
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium">{config.label}</span>
    </div>
  );
}

const SubAgentPanel = memo(function SubAgentPanel({
  activity,
  isStreaming,
}: {
  activity: SubAgentActivity;
  isStreaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(activity.status === "running");
  const [autoCollapsed, setAutoCollapsed] = useState(false);

  // Auto-collapse 1.5s after completion
  useEffect(() => {
    if (activity.status !== "running" && !autoCollapsed && expanded) {
      const timer = setTimeout(() => {
        setExpanded(false);
        setAutoCollapsed(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [activity.status, autoCollapsed, expanded]);

  // Expand when running
  useEffect(() => {
    if (activity.status === "running") {
      setExpanded(true);
      setAutoCollapsed(false);
    }
  }, [activity.status]);

  const statusBadge = useMemo(() => {
    switch (activity.status) {
      case "running":
        return (
          <span className="flex items-center gap-1 text-amber-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            執行中
          </span>
        );
      case "done":
        return (
          <span className="flex items-center gap-1 text-green-600">
            <Check className="h-3 w-3" />
            完成
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 text-red-500">
            <AlertCircle className="h-3 w-3" />
            錯誤
          </span>
        );
    }
  }, [activity.status]);

  const runningToolCount = activity.toolActivities.filter(
    (t) => t.status === "running"
  ).length;

  return (
    <div>
      {/* Header */}
      <button
        onClick={() => { setExpanded(!expanded); setAutoCollapsed(true); }}
        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <GitBranch className="h-3 w-3 shrink-0 text-primary/70" />
        <span className="font-medium text-foreground/80">{activity.repoName}</span>
        <span className="ml-auto">{statusBadge}</span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/40 px-3 pb-2 space-y-2">
          {/* Query */}
          {activity.query && (
            <div className="pt-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">
                查詢：
              </span>
              <p className="text-[11px] text-foreground/70 mt-0.5">
                {activity.query}
              </p>
            </div>
          )}

          {/* Tool activities */}
          {activity.toolActivities.length > 0 && (
            <div className="space-y-0.5">
              <span className="text-[10px] font-medium text-muted-foreground">
                工具活動 ({activity.toolActivities.length})
                {runningToolCount > 0 && ` - ${runningToolCount} 執行中`}
              </span>
              <div className="divide-y divide-border/30">
                {activity.toolActivities.map((ta) => (
                  <SubAgentToolRow key={ta.id} activity={ta} />
                ))}
              </div>
            </div>
          )}

          {/* Text content preview */}
          {activity.textContent && (
            <div className="mt-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                回覆預覽
              </span>
              <div className="mt-0.5 max-h-40 overflow-y-auto rounded bg-muted/50 px-2 py-1.5 text-[11px] text-foreground/70 whitespace-pre-wrap">
                {activity.textContent.length > 1000
                  ? activity.textContent.slice(0, 1000) + "..."
                  : activity.textContent}
              </div>
            </div>
          )}

          {/* Error message */}
          {activity.error && (
            <div className="rounded bg-red-500/10 px-2 py-1.5 text-[11px] text-red-500">
              {activity.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function SubAgentToolRow({ activity }: { activity: ToolActivity }) {
  const { icon: Icon, label, detail } = getToolInfo(activity);

  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px]">
      {activity.status === "running" ? (
        <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-amber-600" />
      ) : (
        <Icon className="h-2.5 w-2.5 shrink-0 text-green-600" />
      )}
      <span className="text-foreground/70">{label}</span>
      {detail && (
        <span className="truncate text-muted-foreground" title={detail}>
          {detail}
        </span>
      )}
    </div>
  );
}

// ─── Tool Activities Panel (original) ────────────────────────────────

/** Collapsible tool activities panel */
function ToolActivitiesPanel({
  activities,
  isStreaming,
}: {
  activities: ToolActivity[];
  isStreaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const runningCount = activities.filter((a) => a.status === "running").length;
  const doneCount = activities.filter((a) => a.status === "done").length;

  return (
    <div className="rounded-lg border border-border/60 bg-card text-xs">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="font-medium">
          工具活動
        </span>
        <span className="ml-auto flex items-center gap-2">
          {runningCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              {runningCount} 執行中
            </span>
          )}
          {doneCount > 0 && (
            <span className="flex items-center gap-1 text-green-600">
              <Check className="h-3 w-3" />
              {doneCount} 完成
            </span>
          )}
        </span>
      </button>

      {/* Activity list */}
      {expanded && (
        <div className="border-t border-border/60 divide-y divide-border/40">
          {activities.map((activity) => (
            <ToolActivityRow key={activity.id} activity={activity} />
          ))}
          {isStreaming && runningCount === 0 && activities.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>處理中...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Check if a tool activity is a sub-agent delegation */
function isSubAgent(activity: ToolActivity): boolean {
  const tool = activity.tool.toLowerCase();
  return (
    tool === "task" ||
    tool.includes("task") ||
    tool.includes("agent") ||
    tool.includes("subagent")
  );
}

/** Single tool activity row */
function ToolActivityRow({ activity }: { activity: ToolActivity }) {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, label, detail } = getToolInfo(activity);
  const hasSubAgent = isSubAgent(activity);
  const hasResult = !!activity.result;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5",
          hasSubAgent && hasResult && "cursor-pointer hover:bg-muted/50"
        )}
        onClick={() => hasSubAgent && hasResult && setExpanded(!expanded)}
      >
        {activity.status === "running" ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-600" />
        ) : (
          <Icon className="h-3 w-3 shrink-0 text-green-600" />
        )}
        <span className="font-medium text-foreground/80">{label}</span>
        {detail && (
          <span className="truncate text-muted-foreground" title={detail}>
            {detail}
          </span>
        )}
        {hasSubAgent && hasResult && (
          <span className="ml-auto shrink-0">
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </span>
        )}
      </div>

      {/* Sub-agent conversation detail */}
      {expanded && hasSubAgent && activity.result && (
        <SubAgentDetail activity={activity} />
      )}
    </div>
  );
}

/** Expandable sub-agent interaction detail */
function SubAgentDetail({ activity }: { activity: ToolActivity }) {
  const input = activity.input || {};
  const agentName =
    String(input.description || input.prompt || activity.tool)
      .split(" ")[0];
  const prompt = String(input.prompt || input.description || "");
  const result = activity.result || "";

  // Truncate very long results for display
  const maxLen = 2000;
  const truncated = result.length > maxLen;
  const displayResult = truncated ? result.slice(0, maxLen) : result;

  return (
    <div className="mx-3 mb-2 rounded-md border border-border/40 bg-muted/30 overflow-hidden">
      {/* Agent prompt */}
      {prompt && (
        <div className="border-b border-border/40 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground mb-1">
            <Bot className="h-3 w-3" />
            委派指令
          </div>
          <p className="text-[11px] text-foreground/70 whitespace-pre-wrap line-clamp-4">
            {prompt}
          </p>
        </div>
      )}

      {/* Agent response */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground mb-1">
          <MessageSquare className="h-3 w-3" />
          {agentName} 回覆
        </div>
        <div className="text-[11px] text-foreground/70 whitespace-pre-wrap max-h-60 overflow-y-auto">
          {displayResult}
          {truncated && (
            <span className="text-muted-foreground"> ...（已截斷）</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Map tool names to icons, labels, and extracted details */
function getToolInfo(activity: ToolActivity): {
  icon: typeof FileText;
  label: string;
  detail: string;
} {
  const input = activity.input || {};
  const tool = activity.tool.toLowerCase();

  if (tool === "read" || tool.includes("read")) {
    const filePath = String(input.file_path || "");
    const shortPath = filePath.split("/").slice(-2).join("/");
    return { icon: FileText, label: "讀取檔案", detail: shortPath };
  }

  if (tool === "grep" || tool.includes("grep")) {
    const pattern = String(input.pattern || "");
    return { icon: Search, label: "搜尋內容", detail: pattern };
  }

  if (tool === "glob" || tool.includes("glob")) {
    const pattern = String(input.pattern || "");
    return { icon: FolderSearch, label: "搜尋檔案", detail: pattern };
  }

  if (tool === "bash" || tool.includes("bash")) {
    const cmd = String(input.command || "");
    const shortCmd = cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
    return { icon: Terminal, label: "執行指令", detail: shortCmd };
  }

  if (isSubAgent(activity)) {
    // Try to extract agent name from tool name or input
    const agentName = activity.tool !== "Task"
      ? activity.tool
      : String(input.description || "").split(" ")[0] || "子代理";
    const desc = String(input.description || input.prompt || "");
    const shortDesc = desc.length > 60 ? desc.slice(0, 57) + "..." : desc;
    return { icon: Bot, label: `代理: ${agentName}`, detail: shortDesc };
  }

  // Fallback
  return {
    icon: Terminal,
    label: activity.tool,
    detail: Object.keys(input).join(", "),
  };
}

/** Token usage and cost summary */
function UsageSummary({ usage }: { usage: UsageInfo }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-card border border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
      <Coins className="h-3 w-3 shrink-0" />
      <span>
        Token: {formatNumber(usage.input_tokens)} 輸入 / {formatNumber(usage.output_tokens)} 輸出
      </span>
      {usage.cost_usd > 0 && (
        <>
          <span className="text-border">|</span>
          <span>成本: ${usage.cost_usd.toFixed(4)}</span>
        </>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}
