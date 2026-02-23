'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent, type AIAgentResponse } from '@/lib/aiAgent'
import { cn, generateUUID } from '@/lib/utils'
import { KnowledgeBaseUpload } from '@/components/KnowledgeBaseUpload'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Label } from '@/components/ui/label'
import { FiMessageSquare, FiPhone, FiHome, FiClock, FiTag, FiUpload, FiSend, FiMic, FiMicOff, FiPhoneOff, FiSearch, FiChevronRight, FiChevronDown, FiChevronUp, FiUser, FiHeadphones, FiAlertTriangle, FiCheck, FiX, FiExternalLink, FiDatabase, FiCpu, FiZap, FiLayers, FiFileText, FiActivity } from 'react-icons/fi'

// ============================================================
// CONSTANTS
// ============================================================
const CHAT_AGENT_ID = '699bf65a69f2efc6b10174af'
const VOICE_AGENT_ID = '699bf66a2cac6aad5e1e40aa'
const TRIAGE_AGENT_ID = '699bf6950cb4051b002d371a'
const RAG_ID = '699bf644b45a5c2df18cc0f6'

// ============================================================
// TYPES
// ============================================================
interface Message {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: string
  metadata?: {
    issue_category?: string
    resolution_status?: string
    escalation_needed?: boolean
    summary?: string
  }
}

interface Conversation {
  id: string
  channel: 'chat' | 'voice'
  messages: Message[]
  status: 'active' | 'pending_triage' | 'triaged' | 'escalated'
  startedAt: string
  endedAt?: string
  sessionId: string
  triageResult?: TriageResult
}

interface TriageResult {
  ticket_subject: string
  priority: string
  category: string
  issue_summary: string
  resolution_status: string
  escalation_needed: boolean
  escalation_reason: string
  recommended_actions: string
  ticket_created: boolean
  hubspot_ticket_id: string
}

interface Ticket {
  id: string
  conversationId: string
  subject: string
  priority: string
  category: string
  summary: string
  status: string
  escalated: boolean
  escalationReason: string
  recommendedActions: string
  hubspotTicketId: string
  createdAt: string
}

type NavScreen = 'dashboard' | 'chat' | 'voice' | 'history' | 'tickets' | 'knowledge'

interface OrchestrationStep {
  id: string
  label: string
  description: string
  status: 'pending' | 'active' | 'completed'
  icon: React.ReactNode
  startedAt?: number
}

interface TicketProperties {
  customerName: string
  customerEmail: string
  primaryIssue: string
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
  category: string
  sentiment: 'Positive' | 'Neutral' | 'Negative' | 'Frustrated'
  sentimentScore: number
  summary: string
  referencedKBLinks: { label: string; url: string }[]
  escalationNeeded: boolean
  escalationReason: string
  recommendedActions: string
}

// ============================================================
// PERSISTENT USER ID (for agent memory)
// ============================================================
function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'user_' + Math.random().toString(36).slice(2, 10)
  const key = 'hdfc_support_user_id'
  let userId = localStorage.getItem(key)
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36)
    localStorage.setItem(key, userId)
  }
  return userId
}

// ============================================================
// HELPERS
// ============================================================

function renderMarkdown(text: string) {
  if (!text) return null

  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  // Helper to detect indent level (for nested lists)
  const getIndent = (ln: string): number => {
    const m = ln.match(/^(\s*)/)
    return m ? Math.floor(m[1].length / 2) : 0
  }

  // Helper to check if a line is a sub-item (indented bullet or number)
  const isSubBullet = (ln: string): boolean => /^\s{2,}[-*+]\s/.test(ln)
  const isSubNumber = (ln: string): boolean => /^\s{2,}\d+\.\s/.test(ln)

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++
      elements.push(
        <div key={`code-${elements.length}`} className="my-3 rounded-lg overflow-hidden border border-border/50">
          {lang && <div className="bg-muted px-3 py-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider border-b border-border/50">{lang}</div>}
          <pre className="bg-muted/50 px-4 py-3 overflow-x-auto">
            <code className="text-xs font-mono leading-relaxed whitespace-pre">{codeLines.join('\n')}</code>
          </pre>
        </div>
      )
      continue
    }

    // Table detection
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableRows: string[] = [line]
      let j = i + 1
      while (j < lines.length && lines[j].includes('|') && lines[j].trim().startsWith('|')) {
        tableRows.push(lines[j])
        j++
      }
      if (tableRows.length >= 2) {
        const headerCells = tableRows[0].split('|').filter(c => c.trim()).map(c => c.trim())
        const isSeparator = (r: string) => r.split('|').filter(c => c.trim()).every(c => /^[-:]+$/.test(c.trim()))
        const startIdx = isSeparator(tableRows[1]) ? 2 : 1
        const bodyRows = tableRows.slice(startIdx)
        elements.push(
          <div key={`table-${elements.length}`} className="my-3 overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  {headerCells.map((cell, ci) => (
                    <th key={ci} className="px-3 py-2 text-left text-xs font-semibold text-foreground border-b border-border/50">{formatInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => {
                  const cells = row.split('|').filter(c => c.trim()).map(c => c.trim())
                  return (
                    <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-muted/20'}>
                      {cells.map((cell, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-xs border-b border-border/30">{formatInline(cell)}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
        i = j
        continue
      }
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      elements.push(<hr key={`hr-${elements.length}`} className="my-4 border-border/40" />)
      i++
      continue
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
        quoteLines.push(lines[i].trimStart().slice(2))
        i++
      }
      elements.push(
        <blockquote key={`bq-${elements.length}`} className="my-3 border-l-[3px] border-primary/40 pl-4 py-2 text-sm text-muted-foreground bg-muted/15 rounded-r-lg">
          {quoteLines.map((ql, qi) => <p key={qi} className="leading-relaxed">{formatInline(ql)}</p>)}
        </blockquote>
      )
      continue
    }

    // Headers
    if (line.startsWith('#### ')) {
      elements.push(<h5 key={`h5-${elements.length}`} className="font-semibold text-xs mt-4 mb-1.5 uppercase tracking-wider text-muted-foreground">{formatInline(line.slice(5))}</h5>)
      i++
      continue
    }
    if (line.startsWith('### ')) {
      elements.push(<h4 key={`h4-${elements.length}`} className="font-semibold text-sm mt-4 mb-1.5 text-foreground">{formatInline(line.slice(4))}</h4>)
      i++
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={`h3-${elements.length}`} className="font-semibold text-base mt-5 mb-2 text-foreground">{formatInline(line.slice(3))}</h3>)
      i++
      continue
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={`h2-${elements.length}`} className="font-bold text-lg mt-5 mb-2 font-serif text-foreground">{formatInline(line.slice(2))}</h2>)
      i++
      continue
    }

    // Ordered list (with nested sub-items support)
    if (/^\s*\d+\.\s/.test(line)) {
      interface ListItem {
        text: string
        subItems: { type: 'bullet' | 'number'; text: string }[]
      }
      const listItems: ListItem[] = []
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i]) && !isSubNumber(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s/, '')
        const subItems: ListItem['subItems'] = []
        i++
        // Collect sub-items (indented bullets or numbers under this numbered item)
        while (i < lines.length && (isSubBullet(lines[i]) || isSubNumber(lines[i]) || /^\s{2,}[^\s]/.test(lines[i]))) {
          if (isSubBullet(lines[i])) {
            subItems.push({ type: 'bullet', text: lines[i].replace(/^\s*[-*+]\s/, '') })
          } else if (isSubNumber(lines[i])) {
            subItems.push({ type: 'number', text: lines[i].replace(/^\s*\d+\.\s/, '') })
          } else {
            // Continuation text under a list item
            subItems.push({ type: 'bullet', text: lines[i].trim() })
          }
          i++
        }
        listItems.push({ text: itemText, subItems })
      }
      elements.push(
        <ol key={`ol-${elements.length}`} className="my-2.5 space-y-2 pl-1">
          {listItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-3 text-sm leading-relaxed">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5 flex-shrink-0 border border-primary/20">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0 pt-0.5">
                <span className="leading-relaxed">{formatInline(item.text)}</span>
                {item.subItems.length > 0 && (
                  <div className="mt-1.5 ml-0.5 space-y-1 border-l-2 border-muted pl-3">
                    {item.subItems.map((sub, si) => (
                      <div key={si} className="flex items-start gap-2 text-sm leading-relaxed">
                        {sub.type === 'bullet' ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-[7px] flex-shrink-0" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground font-semibold mt-0.5 flex-shrink-0 w-4 text-right">{si + 1}.</span>
                        )}
                        <span className="text-foreground/80">{formatInline(sub.text)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Unordered list (with nested sub-items support)
    if (/^[-*+]\s/.test(line.trimStart()) && !isSubBullet(line)) {
      interface BulletItem {
        text: string
        subItems: string[]
      }
      const listItems: BulletItem[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trimStart()) && !isSubBullet(lines[i])) {
        const itemText = lines[i].replace(/^[\s]*[-*+]\s/, '')
        const subItems: string[] = []
        i++
        // Collect indented sub-items
        while (i < lines.length && (isSubBullet(lines[i]) || isSubNumber(lines[i]))) {
          subItems.push(lines[i].replace(/^\s*[-*+]\s/, '').replace(/^\s*\d+\.\s/, ''))
          i++
        }
        listItems.push({ text: itemText, subItems })
      }
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2.5 space-y-1.5 pl-1">
          {listItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <span className="w-2 h-2 rounded-full bg-primary/50 mt-[7px] flex-shrink-0 ring-2 ring-primary/10" />
              <div className="flex-1 min-w-0">
                <span className="leading-relaxed">{formatInline(item.text)}</span>
                {item.subItems.length > 0 && (
                  <div className="mt-1.5 ml-0.5 space-y-1 border-l-2 border-muted pl-3">
                    {item.subItems.map((sub, si) => (
                      <div key={si} className="flex items-start gap-2 text-sm leading-relaxed">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40 mt-[9px] flex-shrink-0" />
                        <span className="text-foreground/80">{formatInline(sub)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Empty line -- slightly more spacing for visual breathing room
    if (!line.trim()) {
      elements.push(<div key={`br-${elements.length}`} className="h-2" />)
      i++
      continue
    }

    // Regular paragraph
    elements.push(<p key={`p-${elements.length}`} className="text-sm leading-[1.7]">{formatInline(line)}</p>)
    i++
  }

  return <div className="space-y-1.5">{elements}</div>
}

function formatInline(text: string): React.ReactNode {
  if (!text) return text

  // Process inline formatting: bold, italic, code, links, URLs
  const parts: React.ReactNode[] = []

  // Regex to find markdown links, URLs, bold, italic, inline code
  const regex = /(\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s<>\])"]+)|(`[^`]+`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(__([^_]+)__)|(_([^_]+)_)/g

  let lastIndex = 0
  let match
  let keyCounter = 0

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[1]) {
      // Markdown link [text](url)
      const linkText = match[2]
      const url = match[3]
      parts.push(
        <a key={`link-${keyCounter++}`} href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary inline-flex items-center gap-0.5 font-medium">
          {linkText}<FiExternalLink className="w-3 h-3 inline ml-0.5 opacity-60" />
        </a>
      )
    } else if (match[4]) {
      // Auto-detected URL
      const url = match[4]
      const displayUrl = url.length > 50 ? url.slice(0, 47) + '...' : url
      parts.push(
        <a key={`url-${keyCounter++}`} href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary inline-flex items-center gap-0.5 text-sm">
          {displayUrl}<FiExternalLink className="w-3 h-3 inline ml-0.5 opacity-60" />
        </a>
      )
    } else if (match[5]) {
      // Inline code
      const code = match[5].slice(1, -1)
      parts.push(<code key={`code-${keyCounter++}`} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground/90">{code}</code>)
    } else if (match[6]) {
      // Bold **text**
      parts.push(<strong key={`bold-${keyCounter++}`} className="font-semibold">{match[7]}</strong>)
    } else if (match[8]) {
      // Italic *text*
      parts.push(<em key={`italic-${keyCounter++}`} className="italic">{match[9]}</em>)
    } else if (match[10]) {
      // Bold __text__
      parts.push(<strong key={`bold2-${keyCounter++}`} className="font-semibold">{match[11]}</strong>)
    } else if (match[12]) {
      // Italic _text_
      parts.push(<em key={`italic2-${keyCounter++}`} className="italic">{match[13]}</em>)
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

function parseAgentResponse(result: AIAgentResponse) {
  try {
    let data = result?.response?.result
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        return { response_message: data }
      }
    }
    if (data?.result && typeof data.result === 'object') {
      data = data.result
    }
    return data || {}
  } catch {
    return {}
  }
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDate(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

function getPriorityColor(priority: string): string {
  const p = (priority || '').toLowerCase()
  if (p === 'critical') return 'bg-red-600 text-white'
  if (p === 'high') return 'bg-orange-500 text-white'
  if (p === 'medium') return 'bg-amber-500 text-white'
  if (p === 'low') return 'bg-green-600 text-white'
  return 'bg-muted text-muted-foreground'
}

function getStatusColor(status: string): string {
  const s = (status || '').toLowerCase()
  if (s === 'active') return 'bg-green-100 text-green-800 border-green-300'
  if (s === 'pending_triage') return 'bg-amber-100 text-amber-800 border-amber-300'
  if (s === 'triaged') return 'bg-blue-100 text-blue-800 border-blue-300'
  if (s === 'escalated') return 'bg-red-100 text-red-800 border-red-300'
  if (s === 'resolved') return 'bg-green-100 text-green-800 border-green-300'
  if (s === 'unresolved') return 'bg-red-100 text-red-800 border-red-300'
  if (s === 'partially_resolved') return 'bg-amber-100 text-amber-800 border-amber-300'
  return 'bg-muted text-muted-foreground'
}

function getStatusLabel(status: string): string {
  const s = (status || '').toLowerCase()
  if (s === 'pending_triage') return 'Pending Triage'
  if (s === 'partially_resolved') return 'Partially Resolved'
  return (status || '').charAt(0).toUpperCase() + (status || '').slice(1)
}

function getReferencedLinks(category: string): { label: string; url: string }[] {
  const baseLinks: Record<string, { label: string; url: string }[]> = {
    login: [
      { label: 'HDFC NetBanking Login', url: 'https://netbanking.hdfcbank.com' },
      { label: 'Mobile Banking App Guide', url: 'https://www.hdfcbank.com/personal/ways-to-bank/mobile-banking' },
      { label: 'Reset Password / IPIN', url: 'https://www.hdfcbank.com/personal/ways-to-bank/netbanking' },
    ],
    password_reset: [
      { label: 'Reset IPIN Guide', url: 'https://www.hdfcbank.com/personal/ways-to-bank/netbanking' },
      { label: 'Customer Care Contact', url: 'https://www.hdfcbank.com/personal/need-help/contact-us' },
      { label: 'Branch Locator', url: 'https://www.hdfcbank.com/branch-atm-locator' },
    ],
    onboarding: [
      { label: 'Open Account Online', url: 'https://www.hdfcbank.com/personal/save/accounts' },
      { label: 'Account Types Comparison', url: 'https://www.hdfcbank.com/personal/save/accounts/savings-accounts' },
      { label: 'KYC Requirements', url: 'https://www.hdfcbank.com/personal/need-help/kyc-centre' },
      { label: 'Branch Locator', url: 'https://www.hdfcbank.com/branch-atm-locator' },
    ],
    product_info: [
      { label: 'Savings Accounts', url: 'https://www.hdfcbank.com/personal/save/accounts/savings-accounts' },
      { label: 'Credit Cards', url: 'https://www.hdfcbank.com/personal/pay/cards/credit-cards' },
      { label: 'Home Loans', url: 'https://www.hdfcbank.com/personal/borrow/popular-loans/home-loan' },
      { label: 'Fixed Deposits', url: 'https://www.hdfcbank.com/personal/save/deposits/fixed-deposit' },
    ],
    account_security: [
      { label: 'Report Fraud', url: 'https://www.hdfcbank.com/personal/need-help/report-a-fraud' },
      { label: 'Block Card Instantly', url: 'https://www.hdfcbank.com/personal/pay/cards/credit-cards' },
      { label: 'Customer Care (24x7)', url: 'https://www.hdfcbank.com/personal/need-help/contact-us' },
      { label: 'Security Tips', url: 'https://www.hdfcbank.com/personal/need-help/safe-banking' },
    ],
    transactions: [
      { label: 'Fund Transfer (NEFT/RTGS/IMPS)', url: 'https://www.hdfcbank.com/personal/pay/money-transfer' },
      { label: 'UPI Payments', url: 'https://www.hdfcbank.com/personal/pay/money-transfer/upi' },
      { label: 'Transaction Limits', url: 'https://www.hdfcbank.com/personal/ways-to-bank/netbanking' },
    ],
    account: [
      { label: 'Account Statement', url: 'https://www.hdfcbank.com/personal/ways-to-bank/netbanking' },
      { label: 'Update Contact Details', url: 'https://www.hdfcbank.com/personal/need-help/contact-us' },
      { label: 'Demat Account', url: 'https://www.hdfcbank.com/personal/invest/demat-account' },
    ],
    general: [
      { label: 'HDFC Bank Homepage', url: 'https://www.hdfcbank.com' },
      { label: 'Customer Support', url: 'https://www.hdfcbank.com/personal/need-help/contact-us' },
      { label: 'FAQs', url: 'https://www.hdfcbank.com/personal/need-help/faqs' },
    ],
  }
  return baseLinks[category] || baseLinks['general']
}

// ============================================================
// FRONT-END TRIAGE ANALYSIS (no external tools)
// ============================================================
function analyzeTranscriptForTicket(messages: Message[], channel: 'chat' | 'voice'): TicketProperties {
  const allUserText = messages.filter(m => m.role === 'user').map(m => m.content).join(' ').toLowerCase()
  const allAgentText = messages.filter(m => m.role === 'agent').map(m => m.content).join(' ').toLowerCase()
  const fullText = allUserText + ' ' + allAgentText
  const lastAgentMsg = [...messages].reverse().find(m => m.role === 'agent')
  const lastMeta = lastAgentMsg?.metadata

  // Extract category from metadata or text analysis
  let category = lastMeta?.issue_category || 'general'
  if (category === 'general') {
    if (/login|sign.?in|log.?in|ipin|password|otp/.test(allUserText)) category = 'login'
    else if (/password|reset|forgot|ipin/.test(allUserText)) category = 'password_reset'
    else if (/open.?account|new.?account|onboard|kyc|register/.test(allUserText)) category = 'onboarding'
    else if (/credit.?card|debit.?card|home.?loan|fixed.?deposit|savings|product|interest.?rate/.test(allUserText)) category = 'product_info'
    else if (/fraud|stolen|unauthorized|hack|security|block.?card/.test(allUserText)) category = 'account_security'
    else if (/transfer|neft|rtgs|imps|upi|payment|transaction/.test(allUserText)) category = 'transactions'
    else if (/account|statement|balance|details/.test(allUserText)) category = 'account'
  }

  // Determine priority
  let priority: TicketProperties['priority'] = 'Medium'
  if (/fraud|stolen|unauthorized|hack|security.?breach|blocked|locked|urgent|immediately/.test(allUserText)) priority = 'Critical'
  else if (/failed|error|not.?working|broken|unable|can.?t|cannot|issue|problem/.test(allUserText)) priority = 'High'
  else if (/help|how.?to|guide|question|info/.test(allUserText)) priority = 'Low'

  // Sentiment analysis
  let sentiment: TicketProperties['sentiment'] = 'Neutral'
  let sentimentScore = 50
  const negativeWords = (allUserText.match(/angry|frustrated|upset|terrible|horrible|worst|hate|annoyed|disappointed|unacceptable|ridiculous|stupid|useless|pathetic|disgusted/g) || []).length
  const positiveWords = (allUserText.match(/thanks|thank|great|good|helpful|appreciate|excellent|wonderful|perfect|amazing/g) || []).length
  const urgentWords = (allUserText.match(/urgent|immediately|asap|emergency|critical|please.?help|desperate|stuck/g) || []).length

  if (negativeWords >= 2 || urgentWords >= 2) { sentiment = 'Frustrated'; sentimentScore = 15 }
  else if (negativeWords >= 1) { sentiment = 'Negative'; sentimentScore = 30 }
  else if (positiveWords >= 2) { sentiment = 'Positive'; sentimentScore = 85 }
  else if (positiveWords >= 1) { sentiment = 'Positive'; sentimentScore = 70 }

  // Determine escalation
  const escalationNeeded = lastMeta?.escalation_needed ||
    priority === 'Critical' ||
    sentiment === 'Frustrated' ||
    lastMeta?.resolution_status === 'needs_escalation' ||
    lastMeta?.resolution_status === 'unresolved'

  // Build primary issue summary
  const firstUserMsg = messages.find(m => m.role === 'user')?.content || 'Customer inquiry'
  const primaryIssue = lastMeta?.summary || firstUserMsg.slice(0, 120) + (firstUserMsg.length > 120 ? '...' : '')

  // Get KB links
  const referencedKBLinks = getReferencedLinks(category)

  return {
    customerName: '',
    customerEmail: '',
    primaryIssue,
    priority,
    category,
    sentiment,
    sentimentScore,
    summary: `${channel === 'voice' ? 'Voice call' : 'Chat conversation'} with ${messages.length} messages. ${lastMeta?.summary || primaryIssue}`,
    referencedKBLinks,
    escalationNeeded: !!escalationNeeded,
    escalationReason: escalationNeeded ? (lastMeta?.resolution_status === 'unresolved' ? 'Issue remains unresolved after L1 support' : priority === 'Critical' ? 'Critical priority issue requiring immediate L2 attention' : sentiment === 'Frustrated' ? 'Customer expressing high frustration - requires immediate human attention' : 'Agent recommended escalation during conversation') : '',
    recommendedActions: escalationNeeded ? 'Assign to L2 specialist team. Review full transcript before contacting customer. Follow up within 2 hours for Critical priority.' : 'Ticket created for tracking. No immediate action required.',
  }
}

function getSentimentColor(sentiment: string): string {
  if (sentiment === 'Positive') return 'bg-green-100 text-green-800 border-green-300'
  if (sentiment === 'Negative') return 'bg-orange-100 text-orange-800 border-orange-300'
  if (sentiment === 'Frustrated') return 'bg-red-100 text-red-800 border-red-300'
  return 'bg-blue-100 text-blue-800 border-blue-300'
}

function getSentimentBarColor(sentiment: string): string {
  if (sentiment === 'Positive') return 'bg-green-500'
  if (sentiment === 'Negative') return 'bg-orange-500'
  if (sentiment === 'Frustrated') return 'bg-red-500'
  return 'bg-blue-500'
}

// ============================================================
// CONVERT TO TICKET MODAL
// ============================================================
function ConvertToTicketModal({
  open,
  onClose,
  messages,
  channel,
  onTicketCreated,
}: {
  open: boolean
  onClose: () => void
  messages: Message[]
  channel: 'chat' | 'voice'
  onTicketCreated: (ticket: Ticket, conversation: Conversation) => void
}) {
  const [ticketProps, setTicketProps] = useState<TicketProperties | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeStage, setAnalyzeStage] = useState(0)
  const [created, setCreated] = useState(false)

  useEffect(() => {
    if (open && messages.length > 0) {
      setAnalyzing(true)
      setCreated(false)
      setAnalyzeStage(0)
      setCustomerName('')
      setCustomerEmail('')

      // Simulate orchestration stages
      const stages = [1, 2, 3, 4, 5]
      const timers = stages.map((stage, i) =>
        setTimeout(() => setAnalyzeStage(stage), (i + 1) * 600)
      )

      // Run actual analysis after visual steps
      const analyzeTimer = setTimeout(() => {
        const result = analyzeTranscriptForTicket(messages, channel)
        setTicketProps(result)
        setAnalyzing(false)
      }, 3200)

      return () => {
        timers.forEach(t => clearTimeout(t))
        clearTimeout(analyzeTimer)
      }
    }
  }, [open, messages, channel])

  const handleCreateTicket = () => {
    if (!ticketProps) return

    const sessionId = 'ticket_' + generateUUID().slice(0, 8)
    const conv: Conversation = {
      id: generateUUID(),
      channel,
      messages,
      status: ticketProps.escalationNeeded ? 'escalated' : 'triaged',
      startedAt: messages[0]?.timestamp || new Date().toISOString(),
      endedAt: new Date().toISOString(),
      sessionId,
      triageResult: {
        ticket_subject: ticketProps.primaryIssue.slice(0, 80),
        priority: ticketProps.priority,
        category: ticketProps.category,
        issue_summary: ticketProps.summary,
        resolution_status: ticketProps.escalationNeeded ? 'unresolved' : 'resolved',
        escalation_needed: ticketProps.escalationNeeded,
        escalation_reason: ticketProps.escalationReason,
        recommended_actions: ticketProps.recommendedActions,
        ticket_created: true,
        hubspot_ticket_id: 'TKT-' + Date.now().toString().slice(-6),
      },
    }

    const ticket: Ticket = {
      id: conv.triageResult!.hubspot_ticket_id,
      conversationId: conv.id,
      subject: `[${ticketProps.priority}] ${ticketProps.primaryIssue.slice(0, 80)}`,
      priority: ticketProps.priority,
      category: ticketProps.category,
      summary: ticketProps.summary + (customerName ? `\n\nCustomer: ${customerName}` : '') + (customerEmail ? `\nEmail: ${customerEmail}` : '') + `\nSentiment: ${ticketProps.sentiment} (${ticketProps.sentimentScore}%)` + (ticketProps.escalationNeeded ? `\nEscalation Reason: ${ticketProps.escalationReason}` : ''),
      status: ticketProps.escalationNeeded ? 'unresolved' : 'resolved',
      escalated: ticketProps.escalationNeeded,
      escalationReason: ticketProps.escalationReason,
      recommendedActions: ticketProps.recommendedActions,
      hubspotTicketId: conv.triageResult!.hubspot_ticket_id,
      createdAt: new Date().toISOString(),
    }

    onTicketCreated(ticket, conv)
    setCreated(true)
  }

  const analyzeStages = [
    { label: 'Reading transcript', icon: <FiFileText className="w-3.5 h-3.5" /> },
    { label: 'Analyzing sentiment', icon: <FiActivity className="w-3.5 h-3.5" /> },
    { label: 'Classifying issue', icon: <FiLayers className="w-3.5 h-3.5" /> },
    { label: 'Determining priority', icon: <FiAlertTriangle className="w-3.5 h-3.5" /> },
    { label: 'Generating ticket', icon: <FiTag className="w-3.5 h-3.5" /> },
  ]

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <FiFileText className="w-5 h-5 text-primary" />
            Convert to Ticket
          </DialogTitle>
          <DialogDescription>
            {analyzing ? 'Analyzing conversation transcript...' : created ? 'Ticket created successfully' : 'Review ticket properties and create a support ticket'}
          </DialogDescription>
        </DialogHeader>

        {analyzing ? (
          <div className="py-6 space-y-3">
            {analyzeStages.map((stage, i) => (
              <div key={i} className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-500',
                analyzeStage > i ? 'bg-green-50 border border-green-200/50' :
                analyzeStage === i ? 'bg-primary/10 border border-primary/20' :
                'opacity-40'
              )}>
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                  analyzeStage > i ? 'bg-green-600 text-white' :
                  analyzeStage === i ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'
                )}>
                  {analyzeStage > i ? <FiCheck className="w-3 h-3" /> :
                   analyzeStage === i ? <div className="w-2 h-2 rounded-full bg-primary-foreground animate-ping" /> :
                   stage.icon}
                </div>
                <span className={cn(
                  'text-sm font-medium',
                  analyzeStage > i ? 'text-green-700' :
                  analyzeStage === i ? 'text-primary' :
                  'text-muted-foreground'
                )}>{stage.label}</span>
                {analyzeStage === i && (
                  <div className="flex gap-0.5 ml-auto">
                    <div className="w-1 h-1 rounded-full bg-primary animate-bounce" />
                    <div className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : created ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <FiCheck className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="font-serif text-lg font-semibold mb-2">Ticket Created Successfully</h3>
            <p className="text-sm text-muted-foreground mb-1">
              Ticket ID: <span className="font-mono font-medium">{ticketProps ? 'TKT-' + Date.now().toString().slice(-6) : ''}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {ticketProps?.escalationNeeded ? 'This ticket has been marked for L2 escalation.' : 'The conversation has been saved and the ticket is ready for review.'}
            </p>
            <Button className="mt-6" onClick={onClose}>Close</Button>
          </div>
        ) : ticketProps ? (
          <div className="space-y-5 mt-2">
            {/* Customer Details */}
            <div className="rounded-lg border border-border/50 p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FiUser className="w-4 h-4 text-primary" />
                Customer Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cust-name" className="text-xs text-muted-foreground">Customer Name</Label>
                  <Input
                    id="cust-name"
                    placeholder="Enter customer name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 bg-background"
                  />
                </div>
                <div>
                  <Label htmlFor="cust-email" className="text-xs text-muted-foreground">Email Address</Label>
                  <Input
                    id="cust-email"
                    type="email"
                    placeholder="customer@email.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="mt-1 bg-background"
                  />
                </div>
              </div>
            </div>

            {/* Issue & Classification */}
            <div className="rounded-lg border border-border/50 p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FiTag className="w-4 h-4 text-primary" />
                Issue Classification
              </h4>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Primary Issue</p>
                  <p className="text-sm font-medium">{ticketProps.primaryIssue}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className={cn('text-xs', getPriorityColor(ticketProps.priority))}>{ticketProps.priority} Priority</Badge>
                  <Badge variant="outline" className="text-xs">{ticketProps.category.replace(/_/g, ' ')}</Badge>
                  {ticketProps.escalationNeeded && (
                    <Badge variant="destructive" className="text-xs">
                      <FiAlertTriangle className="w-3 h-3 mr-1" />
                      Escalation Required
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Summary</p>
                  <p className="text-sm text-foreground/80">{ticketProps.summary}</p>
                </div>
              </div>
            </div>

            {/* Sentiment Analysis */}
            <div className="rounded-lg border border-border/50 p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FiActivity className="w-4 h-4 text-primary" />
                Sentiment Analysis
              </h4>
              <div className="flex items-center gap-4">
                <Badge variant="outline" className={cn('text-xs border px-3 py-1', getSentimentColor(ticketProps.sentiment))}>
                  {ticketProps.sentiment}
                </Badge>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground">Sentiment Score</span>
                    <span className="text-[10px] font-mono font-semibold">{ticketProps.sentimentScore}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-1000', getSentimentBarColor(ticketProps.sentiment))}
                      style={{ width: `${ticketProps.sentimentScore}%` }}
                    />
                  </div>
                </div>
              </div>
              {ticketProps.sentiment === 'Frustrated' && (
                <p className="text-xs text-red-600 mt-2 bg-red-50 px-3 py-1.5 rounded">
                  <FiAlertTriangle className="w-3 h-3 inline mr-1" />
                  Customer is expressing high frustration. Priority handling recommended.
                </p>
              )}
            </div>

            {/* Referenced KB Articles */}
            <div className="rounded-lg border border-border/50 p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FiDatabase className="w-4 h-4 text-primary" />
                Referenced KB Articles
              </h4>
              <div className="space-y-1.5">
                {ticketProps.referencedKBLinks.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline underline-offset-2 group py-0.5"
                  >
                    <FiChevronRight className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    <span>{link.label}</span>
                    <FiExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>

            {/* Escalation Info */}
            {ticketProps.escalationNeeded && (
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                <h4 className="text-sm font-semibold mb-2 text-red-700 flex items-center gap-2">
                  <FiAlertTriangle className="w-4 h-4" />
                  Escalation Details
                </h4>
                <p className="text-sm text-red-800 mb-2">{ticketProps.escalationReason}</p>
                <p className="text-xs text-red-600">{ticketProps.recommendedActions}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleCreateTicket} className="gap-2">
                <FiFileText className="w-4 h-4" />
                Create Ticket
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// Sample data for the toggle
function generateSampleConversations(): Conversation[] {
  const now = new Date()
  return [
    {
      id: generateUUID(),
      channel: 'chat',
      messages: [
        { id: generateUUID(), role: 'user', content: 'I am unable to log in to my HDFC Bank mobile app. It keeps showing an incorrect password error.', timestamp: new Date(now.getTime() - 3600000).toISOString() },
        { id: generateUUID(), role: 'agent', content: 'I understand you are facing login issues with the HDFC Bank mobile app. Let me help you with that.\n\n**Step 1:** Please ensure you are entering the correct Customer ID and IPIN.\n**Step 2:** If you have forgotten your IPIN, you can reset it via the "Forgot IPIN" link on the login screen.\n**Step 3:** Make sure your app is updated to the latest version from the App Store or Play Store.\n\nWould you like me to guide you through the IPIN reset process?', timestamp: new Date(now.getTime() - 3500000).toISOString(), metadata: { issue_category: 'login', resolution_status: 'partially_resolved', escalation_needed: false, summary: 'Customer unable to log in to mobile app. Provided steps for IPIN reset.' } },
        { id: generateUUID(), role: 'user', content: 'Yes, please help me reset my IPIN.', timestamp: new Date(now.getTime() - 3400000).toISOString() },
        { id: generateUUID(), role: 'agent', content: 'To reset your IPIN:\n\n1. Open the HDFC Bank MobileBanking app\n2. Tap on "Forgot IPIN" on the login screen\n3. Enter your registered Customer ID\n4. You will receive an OTP on your registered mobile number\n5. Enter the OTP and create a new IPIN\n\nPlease ensure your registered mobile number is active. If you face any issues, I am here to help!', timestamp: new Date(now.getTime() - 3300000).toISOString(), metadata: { issue_category: 'password_reset', resolution_status: 'resolved', escalation_needed: false, summary: 'Guided customer through IPIN reset process successfully.' } },
      ],
      status: 'triaged',
      startedAt: new Date(now.getTime() - 3600000).toISOString(),
      endedAt: new Date(now.getTime() - 3200000).toISOString(),
      sessionId: 'session_' + generateUUID().slice(0, 8),
      triageResult: {
        ticket_subject: 'Mobile App Login Issue - IPIN Reset',
        priority: 'Medium',
        category: 'login',
        issue_summary: 'Customer was unable to log in due to incorrect IPIN. Guided through reset process.',
        resolution_status: 'resolved',
        escalation_needed: false,
        escalation_reason: '',
        recommended_actions: 'No further action needed. Customer was able to reset IPIN successfully.',
        ticket_created: true,
        hubspot_ticket_id: 'HUB-2024-001'
      }
    },
    {
      id: generateUUID(),
      channel: 'voice',
      messages: [
        { id: generateUUID(), role: 'user', content: '[Voice] I want to know about the interest rates for home loans.', timestamp: new Date(now.getTime() - 7200000).toISOString() },
        { id: generateUUID(), role: 'agent', content: 'Thank you for calling HDFC Bank. Our current home loan interest rates start from 8.50% per annum for salaried individuals. The rate depends on your credit score, loan amount, and tenure. Would you like me to provide more details about eligibility criteria?', timestamp: new Date(now.getTime() - 7100000).toISOString(), metadata: { issue_category: 'product_info', resolution_status: 'resolved', escalation_needed: false, summary: 'Customer inquired about home loan interest rates. Provided current rate information.' } },
      ],
      status: 'pending_triage',
      startedAt: new Date(now.getTime() - 7200000).toISOString(),
      endedAt: new Date(now.getTime() - 7000000).toISOString(),
      sessionId: 'session_' + generateUUID().slice(0, 8),
    },
    {
      id: generateUUID(),
      channel: 'chat',
      messages: [
        { id: generateUUID(), role: 'user', content: 'My debit card was stolen and I need to block it immediately!', timestamp: new Date(now.getTime() - 1800000).toISOString() },
        { id: generateUUID(), role: 'agent', content: 'I understand this is urgent. Let me help you block your debit card immediately.\n\n**Immediate steps taken:**\n- Your card ending in XXXX has been flagged for blocking\n- A temporary hold has been placed\n\n**Important:** For complete card blocking, please also:\n1. Call our 24x7 helpline at 1800-XXX-XXXX\n2. Or SMS "BLOCK CARD" to XXXXX from your registered mobile number\n\nI am escalating this to our security team for immediate action. Would you like a replacement card?', timestamp: new Date(now.getTime() - 1700000).toISOString(), metadata: { issue_category: 'account_security', resolution_status: 'needs_escalation', escalation_needed: true, summary: 'Customer reported stolen debit card. Urgent escalation needed for card blocking and security review.' } },
      ],
      status: 'escalated',
      startedAt: new Date(now.getTime() - 1800000).toISOString(),
      endedAt: new Date(now.getTime() - 1600000).toISOString(),
      sessionId: 'session_' + generateUUID().slice(0, 8),
      triageResult: {
        ticket_subject: 'URGENT: Stolen Debit Card - Immediate Block Required',
        priority: 'Critical',
        category: 'account_security',
        issue_summary: 'Customer reported debit card theft. Requires immediate card blocking and security review.',
        resolution_status: 'unresolved',
        escalation_needed: true,
        escalation_reason: 'Potential fraudulent activity - stolen card requires immediate L2 security team intervention.',
        recommended_actions: 'Block card immediately. Review recent transactions for unauthorized activity. Issue replacement card. Monitor account for 30 days.',
        ticket_created: true,
        hubspot_ticket_id: 'HUB-2024-003'
      }
    },
    {
      id: generateUUID(),
      channel: 'chat',
      messages: [
        { id: generateUUID(), role: 'user', content: 'How do I open a new savings account with HDFC Bank?', timestamp: new Date(now.getTime() - 5400000).toISOString() },
        { id: generateUUID(), role: 'agent', content: 'Welcome to HDFC Bank! I would be happy to help you open a new savings account.\n\n**You can open a savings account through:**\n\n1. **Online (Instant Account Opening):**\n   - Visit hdfcbank.com\n   - Click on "Open Account Online"\n   - Have your Aadhaar and PAN ready for e-KYC\n\n2. **In Branch:**\n   - Visit your nearest HDFC Bank branch\n   - Carry valid photo ID, address proof, and 2 passport-size photos\n\n**Popular Savings Account Options:**\n- Regular Savings Account (Min Balance: Rs. 10,000)\n- Women Savings Account\n- Senior Citizens Savings Account\n- Kids Advantage Account\n\nWould you like me to help you identify which account type is best for you?', timestamp: new Date(now.getTime() - 5300000).toISOString(), metadata: { issue_category: 'onboarding', resolution_status: 'resolved', escalation_needed: false, summary: 'Customer inquired about opening new savings account. Provided comprehensive guidance.' } },
      ],
      status: 'pending_triage',
      startedAt: new Date(now.getTime() - 5400000).toISOString(),
      endedAt: new Date(now.getTime() - 5200000).toISOString(),
      sessionId: 'session_' + generateUUID().slice(0, 8),
    },
  ]
}

function generateSampleTickets(conversations: Conversation[]): Ticket[] {
  const tickets: Ticket[] = []
  conversations.forEach(conv => {
    if (conv.triageResult) {
      tickets.push({
        id: conv.triageResult.hubspot_ticket_id || generateUUID().slice(0, 8),
        conversationId: conv.id,
        subject: conv.triageResult.ticket_subject,
        priority: conv.triageResult.priority,
        category: conv.triageResult.category,
        summary: conv.triageResult.issue_summary,
        status: conv.triageResult.resolution_status,
        escalated: conv.triageResult.escalation_needed,
        escalationReason: conv.triageResult.escalation_reason,
        recommendedActions: conv.triageResult.recommended_actions,
        hubspotTicketId: conv.triageResult.hubspot_ticket_id,
        createdAt: conv.endedAt || conv.startedAt,
      })
    }
  })
  return tickets
}

// ============================================================
// ERROR BOUNDARY
// ============================================================
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================
// SIDEBAR NAV
// ============================================================
function SidebarNav({
  activeScreen,
  onNavigate,
  activeChats,
  activeCalls,
  openTickets,
}: {
  activeScreen: NavScreen
  onNavigate: (screen: NavScreen) => void
  activeChats: number
  activeCalls: number
  openTickets: number
}) {
  const navItems: { id: NavScreen; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <FiHome className="w-5 h-5" /> },
    { id: 'chat', label: 'Chat Support', icon: <FiMessageSquare className="w-5 h-5" />, badge: activeChats },
    { id: 'voice', label: 'Voice Support', icon: <FiPhone className="w-5 h-5" />, badge: activeCalls },
    { id: 'history', label: 'History', icon: <FiClock className="w-5 h-5" /> },
    { id: 'tickets', label: 'Tickets', icon: <FiTag className="w-5 h-5" />, badge: openTickets },
    { id: 'knowledge', label: 'Knowledge Base', icon: <FiUpload className="w-5 h-5" /> },
  ]

  return (
    <aside className="w-64 min-h-screen bg-card border-r border-border/30 flex flex-col">
      <div className="p-5 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <FiHeadphones className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-serif text-lg font-semibold tracking-wide text-foreground">HDFC Bank</h1>
            <p className="text-xs text-muted-foreground tracking-wider uppercase">L1 Support</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
              activeScreen === item.id
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-foreground/70 hover:bg-secondary hover:text-foreground'
            )}
          >
            {item.icon}
            <span className="flex-1 text-left">{item.label}</span>
            {(item.badge ?? 0) > 0 && (
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full font-semibold',
                activeScreen === item.id
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-primary/10 text-primary'
              )}>
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-border/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <FiUser className="w-4 h-4 text-secondary-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Support Agent</p>
            <p className="text-xs text-muted-foreground">L1 Team</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

// ============================================================
// DASHBOARD SCREEN
// ============================================================
function DashboardScreen({
  conversations,
  tickets,
  onNavigate,
}: {
  conversations: Conversation[]
  tickets: Ticket[]
  onNavigate: (screen: NavScreen) => void
}) {
  const activeChats = conversations.filter(c => c.channel === 'chat' && c.status === 'active').length
  const activeCalls = conversations.filter(c => c.channel === 'voice' && c.status === 'active').length
  const openTickets = tickets.filter(t => t.status !== 'resolved').length
  const escalatedToday = conversations.filter(c => c.status === 'escalated').length
  const pendingTriage = conversations.filter(c => c.status === 'pending_triage').length
  const recentConvs = [...conversations].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 5)

  const stats = [
    { label: 'Active Chats', value: activeChats, icon: <FiMessageSquare className="w-6 h-6" />, color: 'text-blue-600' },
    { label: 'Active Calls', value: activeCalls, icon: <FiPhone className="w-6 h-6" />, color: 'text-green-600' },
    { label: 'Open Tickets', value: openTickets, icon: <FiTag className="w-6 h-6" />, color: 'text-amber-600' },
    { label: 'Escalated', value: escalatedToday, icon: <FiAlertTriangle className="w-6 h-6" />, color: 'text-red-600' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold tracking-wide">Dashboard</h2>
        <p className="text-muted-foreground text-sm mt-1">Overview of your customer support operations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => (
          <Card key={stat.label} className="border-border/30 shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</p>
                  <p className="text-3xl font-serif font-semibold mt-1">{stat.value}</p>
                </div>
                <div className={cn('p-3 rounded-xl bg-secondary', stat.color)}>
                  {stat.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border/30 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">Recent Conversations</CardTitle>
            <CardDescription>Latest customer interactions</CardDescription>
          </CardHeader>
          <CardContent>
            {recentConvs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FiMessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No conversations yet. Start a chat or voice call.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentConvs.map(conv => (
                  <div key={conv.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer" onClick={() => onNavigate('history')}>
                    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center', conv.channel === 'chat' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600')}>
                      {conv.channel === 'chat' ? <FiMessageSquare className="w-4 h-4" /> : <FiPhone className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {conv.messages?.[0]?.content?.slice(0, 60) ?? 'Conversation'}
                        {(conv.messages?.[0]?.content?.length ?? 0) > 60 ? '...' : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(conv.startedAt)} at {formatTimestamp(conv.startedAt)}</p>
                    </div>
                    <Badge variant="outline" className={cn('text-xs border', getStatusColor(conv.status))}>
                      {getStatusLabel(conv.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/30 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">Quick Actions</CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start gap-3" onClick={() => onNavigate('chat')}>
              <FiMessageSquare className="w-4 h-4" />
              Open New Chat
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" onClick={() => onNavigate('voice')}>
              <FiPhone className="w-4 h-4" />
              Start Voice Call
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" onClick={() => onNavigate('tickets')}>
              <FiTag className="w-4 h-4" />
              View Tickets ({openTickets})
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" onClick={() => onNavigate('knowledge')}>
              <FiUpload className="w-4 h-4" />
              Knowledge Base
            </Button>
            {pendingTriage > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2">
                  <FiAlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-800">
                    <span className="font-semibold">{pendingTriage}</span> conversation{pendingTriage > 1 ? 's' : ''} pending triage
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/30 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Agent Status</CardTitle>
          <CardDescription>AI agents powering this platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { name: 'Chat Support Agent', id: CHAT_AGENT_ID, desc: 'Text chat with KB search', icon: <FiMessageSquare className="w-4 h-4" /> },
              { name: 'Voice Support Agent', id: VOICE_AGENT_ID, desc: 'Voice calls via WebSocket', icon: <FiPhone className="w-4 h-4" /> },
              { name: 'Triage & Escalation Agent', id: TRIAGE_AGENT_ID, desc: 'Ticket creation via HubSpot', icon: <FiTag className="w-4 h-4" /> },
            ].map(agent => (
              <div key={agent.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">{agent.icon}</div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{agent.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{agent.desc}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs text-green-700 font-medium">Ready</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// ORCHESTRATION PANEL
// ============================================================
function OrchestrationPanel({ agentType }: { agentType: 'chat' | 'triage' }) {
  const [steps, setSteps] = useState<OrchestrationStep[]>([])
  const [elapsedTime, setElapsedTime] = useState(0)
  const startTimeRef = useRef(Date.now())

  useEffect(() => {
    startTimeRef.current = Date.now()
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const chatSteps: OrchestrationStep[] = [
      { id: 'receive', label: 'Receiving Query', description: 'Processing customer message input', status: 'completed', icon: <FiMessageSquare className="w-3.5 h-3.5" /> },
      { id: 'kb_search', label: 'Knowledge Base Search', description: 'Searching SOPs, FAQs, and product documentation', status: 'active', icon: <FiDatabase className="w-3.5 h-3.5" /> },
      { id: 'context', label: 'Context Analysis', description: 'Analyzing conversation history and query intent', status: 'pending', icon: <FiLayers className="w-3.5 h-3.5" /> },
      { id: 'generate', label: 'Response Generation', description: 'Composing structured response with references', status: 'pending', icon: <FiCpu className="w-3.5 h-3.5" /> },
      { id: 'classify', label: 'Issue Classification', description: 'Categorizing issue and determining escalation need', status: 'pending', icon: <FiTag className="w-3.5 h-3.5" /> },
      { id: 'deliver', label: 'Delivering Response', description: 'Formatting and sending agent response', status: 'pending', icon: <FiZap className="w-3.5 h-3.5" /> },
    ]
    const triageSteps: OrchestrationStep[] = [
      { id: 'ingest', label: 'Ingesting Transcript', description: 'Loading full conversation transcript', status: 'completed', icon: <FiClock className="w-3.5 h-3.5" /> },
      { id: 'analyze', label: 'Issue Analysis', description: 'Extracting key issues and customer sentiment', status: 'active', icon: <FiCpu className="w-3.5 h-3.5" /> },
      { id: 'classify', label: 'Priority Classification', description: 'Assigning priority level and category', status: 'pending', icon: <FiLayers className="w-3.5 h-3.5" /> },
      { id: 'ticket', label: 'Creating HubSpot Ticket', description: 'Generating structured ticket in HubSpot', status: 'pending', icon: <FiTag className="w-3.5 h-3.5" /> },
      { id: 'escalation', label: 'Escalation Check', description: 'Determining if L2 escalation is required', status: 'pending', icon: <FiAlertTriangle className="w-3.5 h-3.5" /> },
      { id: 'complete', label: 'Finalizing', description: 'Completing triage and returning results', status: 'pending', icon: <FiCheck className="w-3.5 h-3.5" /> },
    ]
    setSteps(agentType === 'chat' ? chatSteps : triageSteps)

    // Simulate step progression
    const timers: ReturnType<typeof setTimeout>[] = []
    const stepList = agentType === 'chat' ? chatSteps : triageSteps
    stepList.forEach((_step, index) => {
      if (index >= 1) {
        timers.push(setTimeout(() => {
          setSteps(prev => prev.map((s, si) => ({
            ...s,
            status: si < index ? 'completed' as const : si === index ? 'active' as const : 'pending' as const
          })))
        }, index * 2500))
      }
    })
    return () => timers.forEach(t => clearTimeout(t))
  }, [agentType])

  return (
    <div className="flex justify-start">
      <div className="bg-secondary/80 rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%] w-full">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold text-foreground">Agent Processing</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">{elapsedTime}s</span>
        </div>
        <div className="space-y-1.5">
          {steps.map((step) => (
            <div key={step.id} className={cn(
              'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-all duration-500',
              step.status === 'active' ? 'bg-primary/10 border border-primary/20' :
              step.status === 'completed' ? 'bg-green-50/80 border border-green-200/50' :
              'opacity-50'
            )}>
              <div className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                step.status === 'active' ? 'bg-primary text-primary-foreground' :
                step.status === 'completed' ? 'bg-green-600 text-white' :
                'bg-muted text-muted-foreground'
              )}>
                {step.status === 'completed' ? <FiCheck className="w-3 h-3" /> :
                 step.status === 'active' ? <div className="w-2 h-2 rounded-full bg-primary-foreground animate-ping" /> :
                 step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-xs font-medium leading-tight',
                  step.status === 'active' ? 'text-primary' :
                  step.status === 'completed' ? 'text-green-700' :
                  'text-muted-foreground'
                )}>{step.label}</p>
                {step.status === 'active' && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{step.description}</p>
                )}
              </div>
              {step.status === 'active' && (
                <div className="flex gap-0.5">
                  <div className="w-1 h-1 rounded-full bg-primary animate-bounce" />
                  <div className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// CHAT SCREEN
// ============================================================
function ChatScreen({
  conversations,
  setConversations,
  tickets,
  setTickets,
  onNavigate,
  activeAgentId,
  setActiveAgentId,
  userId,
}: {
  conversations: Conversation[]
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  tickets: Ticket[]
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>
  onNavigate: (screen: NavScreen) => void
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
  userId: string
}) {
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [showTicketModal, setShowTicketModal] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [sessionId] = useState(() => 'session_' + generateUUID().slice(0, 8))

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentConversation?.messages])

  const startNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: generateUUID(),
      channel: 'chat',
      messages: [],
      status: 'active',
      startedAt: new Date().toISOString(),
      sessionId,
    }
    setCurrentConversation(newConv)
    setStatusMessage('')
  }, [sessionId])

  const sendMessage = async () => {
    if (!inputValue.trim() || loading) return
    if (!currentConversation) {
      startNewConversation()
    }

    const userMsg: Message = {
      id: generateUUID(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    }

    const updatedConv: Conversation = currentConversation
      ? { ...currentConversation, messages: [...currentConversation.messages, userMsg] }
      : { id: generateUUID(), channel: 'chat', messages: [userMsg], status: 'active', startedAt: new Date().toISOString(), sessionId }

    setCurrentConversation(updatedConv)
    setInputValue('')
    setLoading(true)
    setActiveAgentId(CHAT_AGENT_ID)
    setStatusMessage('')

    try {
      const result = await callAIAgent(inputValue.trim(), CHAT_AGENT_ID, { user_id: userId, session_id: sessionId })

      if (result.success) {
        const data = parseAgentResponse(result)
        const agentMsg: Message = {
          id: generateUUID(),
          role: 'agent',
          content: data?.response_message || data?.message || 'I apologize, I could not process that request. Please try again.',
          timestamp: new Date().toISOString(),
          metadata: {
            issue_category: data?.issue_category,
            resolution_status: data?.resolution_status,
            escalation_needed: data?.escalation_needed,
            summary: data?.summary,
          },
        }
        setCurrentConversation(prev => prev ? { ...prev, messages: [...prev.messages, agentMsg] } : prev)
        if (data?.escalation_needed) {
          setStatusMessage('This issue has been flagged for escalation.')
        }
      } else {
        setStatusMessage('Failed to get response. Please try again.')
        const errorMsg: Message = {
          id: generateUUID(),
          role: 'agent',
          content: 'I apologize, but I encountered an error processing your request. Please try again.',
          timestamp: new Date().toISOString(),
        }
        setCurrentConversation(prev => prev ? { ...prev, messages: [...prev.messages, errorMsg] } : prev)
      }
    } catch {
      setStatusMessage('Network error. Please check your connection.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }

  const endConversation = () => {
    if (!currentConversation || currentConversation.messages.length === 0) return
    const ended: Conversation = {
      ...currentConversation,
      status: 'pending_triage',
      endedAt: new Date().toISOString(),
    }
    setConversations(prev => [ended, ...prev])
    setCurrentConversation(null)
    setStatusMessage('Conversation saved. Ready for triage in History.')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-wide">Chat Support</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {currentConversation ? 'Active conversation' : 'Start a new chat session'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeAgentId === CHAT_AGENT_ID && (
            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
              <div className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
              Chat Agent Active
            </Badge>
          )}
          {currentConversation && currentConversation.messages.length >= 2 && (
            <Button variant="outline" size="sm" onClick={() => setShowTicketModal(true)} className="text-primary border-primary/30 hover:bg-primary/10">
              <FiFileText className="w-4 h-4 mr-1.5" />
              Convert to Ticket
            </Button>
          )}
          {currentConversation && (
            <Button variant="outline" size="sm" onClick={endConversation} className="text-destructive border-destructive/30 hover:bg-destructive/10">
              <FiX className="w-4 h-4 mr-1.5" />
              End Conversation
            </Button>
          )}
          {!currentConversation && (
            <Button onClick={startNewConversation} size="sm">
              <FiMessageSquare className="w-4 h-4 mr-1.5" />
              New Chat
            </Button>
          )}
        </div>
      </div>

      <Card className="flex-1 flex flex-col border-border/30 shadow-sm overflow-hidden">
        <ScrollArea className="flex-1 p-4">
          {!currentConversation || currentConversation.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <FiMessageSquare className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-serif text-lg font-semibold mb-2">HDFC Bank Chat Support</h3>
              <p className="text-muted-foreground text-sm max-w-md">
                Ask about account services, products, login issues, transactions, or any banking query. Our AI assistant is powered by HDFC Bank's knowledge base.
              </p>
              {!currentConversation && (
                <Button onClick={startNewConversation} className="mt-6">
                  Start Conversation
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {currentConversation.messages.map(msg => (
                <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[80%] rounded-2xl px-4 py-3', msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-secondary text-secondary-foreground rounded-bl-md')}>
                    <div className="text-sm leading-relaxed">{renderMarkdown(msg.content)}</div>
                    {msg.role === 'agent' && msg.metadata?.issue_category && (
                      <div className="mt-2.5 pt-2.5 border-t border-border/30">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <FiExternalLink className="w-3 h-3" />
                          Referenced Links
                        </p>
                        <div className="space-y-1">
                          {getReferencedLinks(msg.metadata.issue_category).map((link, li) => (
                            <a
                              key={li}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-xs text-primary hover:underline underline-offset-2 group py-0.5"
                            >
                              <FiChevronRight className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                              <span>{link.label}</span>
                              <FiExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className={cn('flex items-center gap-2 mt-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                      <span className={cn('text-xs', msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                        {formatTimestamp(msg.timestamp)}
                      </span>
                      {msg.metadata?.issue_category && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-background/50 border-border/50">
                          {msg.metadata.issue_category.replace(/_/g, ' ')}
                        </Badge>
                      )}
                      {msg.metadata?.resolution_status && (
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 border', getStatusColor(msg.metadata.resolution_status))}>
                          {getStatusLabel(msg.metadata.resolution_status)}
                        </Badge>
                      )}
                      {msg.metadata?.escalation_needed && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                          <FiAlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                          Escalation
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {loading && <OrchestrationPanel agentType="chat" />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {statusMessage && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200">
            <p className="text-xs text-amber-800 flex items-center gap-1.5">
              <FiAlertTriangle className="w-3 h-3 flex-shrink-0" />
              {statusMessage}
            </p>
          </div>
        )}

        {currentConversation && (
          <div className="p-4 border-t border-border/30 bg-card">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Type your message..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                disabled={loading}
                className="flex-1 bg-background"
              />
              <Button onClick={sendMessage} disabled={loading || !inputValue.trim()} size="icon" className="shrink-0">
                <FiSend className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {currentConversation && (
        <ConvertToTicketModal
          open={showTicketModal}
          onClose={() => setShowTicketModal(false)}
          messages={currentConversation.messages}
          channel="chat"
          onTicketCreated={(ticket, conv) => {
            setTickets(prev => [ticket, ...prev])
            setConversations(prev => [conv, ...prev])
            setCurrentConversation(null)
            setStatusMessage('Ticket created successfully. View in Tickets.')
          }}
        />
      )}
    </div>
  )
}

// ============================================================
// VOICE SCREEN
// ============================================================
function VoiceScreen({
  conversations,
  setConversations,
  tickets,
  setTickets,
  activeAgentId,
  setActiveAgentId,
  userId,
}: {
  conversations: Conversation[]
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  tickets: Ticket[]
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
  userId: string
}) {
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'active' | 'ended'>('idle')
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [transcriptEntries, setTranscriptEntries] = useState<{ role: 'user' | 'agent'; text: string; timestamp: string }[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [thinkingText, setThinkingText] = useState('')
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [ticketModalMessages, setTicketModalMessages] = useState<Message[]>([])
  const voiceSessionIdRef = useRef('voice_' + generateUUID().slice(0, 8))

  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [interruptCount, setInterruptCount] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextPlayTimeRef = useRef(0)
  const isMutedRef = useRef(false)
  const sampleRateRef = useRef(24000)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const activeSourceNodesRef = useRef<AudioBufferSourceNode[]>([])
  const isAgentSpeakingRef = useRef(false)
  const speechEnergyBufferRef = useRef<number[]>([])
  const lastInterruptTimeRef = useRef(0)

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcriptEntries, thinkingText])

  useEffect(() => {
    return () => {
      endCall()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopAgentAudio = useCallback(() => {
    // Stop all queued and playing audio source nodes immediately
    activeSourceNodesRef.current.forEach(node => {
      try { node.stop() } catch { /* already stopped */ }
      try { node.disconnect() } catch { /* already disconnected */ }
    })
    activeSourceNodesRef.current = []
    // Reset the playback queue so next audio starts immediately
    nextPlayTimeRef.current = 0
    isAgentSpeakingRef.current = false
    setIsAgentSpeaking(false)

    // Send interrupt signal to the server
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }))
    }
  }, [])

  const startCall = async () => {
    setCallStatus('connecting')
    setStatusMessage('Connecting to voice agent...')
    setActiveAgentId(VOICE_AGENT_ID)
    setTranscriptEntries([])
    setDuration(0)
    setThinkingText('')
    setInterruptCount(0)
    setIsAgentSpeaking(false)
    setIsUserSpeaking(false)
    nextPlayTimeRef.current = 0
    speechEnergyBufferRef.current = []
    lastInterruptTimeRef.current = 0
    activeSourceNodesRef.current = []
    isAgentSpeakingRef.current = false

    try {
      const currentVoiceSessionId = 'voice_' + generateUUID().slice(0, 8)
      voiceSessionIdRef.current = currentVoiceSessionId

      const res = await fetch('https://voice-sip.studio.lyzr.ai/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: VOICE_AGENT_ID, userId, sessionId: currentVoiceSessionId }),
      })

      if (!res.ok) {
        setCallStatus('idle')
        setStatusMessage('Failed to start voice session. Please try again.')
        setActiveAgentId(null)
        return
      }

      const data = await res.json()
      const wsUrl = data?.wsUrl
      const sr = data?.audioConfig?.sampleRate || 24000
      sampleRateRef.current = sr

      if (!wsUrl) {
        setCallStatus('idle')
        setStatusMessage('Failed to get voice session URL.')
        setActiveAgentId(null)
        return
      }

      const audioContext = new AudioContext({ sampleRate: sr })
      audioContextRef.current = audioContext

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: { ideal: sr }, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      const silentGain = audioContext.createGain()
      silentGain.gain.value = 0
      silentGain.connect(audioContext.destination)
      source.connect(processor)
      processor.connect(silentGain)

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setCallStatus('active')
        setStatusMessage('')
        timerRef.current = setInterval(() => {
          setDuration(prev => prev + 1)
        }, 1000)
      }

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN || isMutedRef.current) return
        const inputData = e.inputBuffer.getChannelData(0)

        // Voice Activity Detection (VAD) for barge-in
        let sumSquares = 0
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i]
        }
        const rms = Math.sqrt(sumSquares / inputData.length)
        const energyDb = 20 * Math.log10(Math.max(rms, 1e-10))

        // Keep a rolling buffer of recent energy levels
        speechEnergyBufferRef.current.push(energyDb)
        if (speechEnergyBufferRef.current.length > 5) {
          speechEnergyBufferRef.current.shift()
        }

        // Detect speech if energy is above threshold consistently
        const speechThreshold = -35 // dB threshold for speech detection
        const consecutiveSpeechFrames = speechEnergyBufferRef.current.filter(e => e > speechThreshold).length
        const userIsSpeaking = consecutiveSpeechFrames >= 3

        if (userIsSpeaking) {
          setIsUserSpeaking(true)

          // Barge-in: if agent is currently speaking, interrupt it
          if (isAgentSpeakingRef.current) {
            const now = Date.now()
            // Debounce: only interrupt if at least 500ms since last interrupt
            if (now - lastInterruptTimeRef.current > 500) {
              lastInterruptTimeRef.current = now
              stopAgentAudio()
              setInterruptCount(prev => prev + 1)
              setThinkingText('')
            }
          }
        } else {
          setIsUserSpeaking(false)
        }

        // Encode and send audio to server
        const pcm16 = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }
        const uint8 = new Uint8Array(pcm16.buffer)
        let binary = ''
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i])
        }
        const base64 = btoa(binary)
        ws.send(JSON.stringify({ type: 'audio', audio: base64, sampleRate: sr }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          if (msg.type === 'audio' && msg.audio) {
            const raw = atob(msg.audio)
            const bytes = new Uint8Array(raw.length)
            for (let i = 0; i < raw.length; i++) {
              bytes[i] = raw.charCodeAt(i)
            }
            const pcm16 = new Int16Array(bytes.buffer)
            const float32 = new Float32Array(pcm16.length)
            for (let i = 0; i < pcm16.length; i++) {
              float32[i] = pcm16[i] / 32768
            }

            if (audioContextRef.current) {
              const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, sampleRateRef.current)
              audioBuffer.getChannelData(0).set(float32)
              const sourceNode = audioContextRef.current.createBufferSource()
              sourceNode.buffer = audioBuffer
              sourceNode.connect(audioContextRef.current.destination)

              // Track this source node for interruption
              activeSourceNodesRef.current.push(sourceNode)
              isAgentSpeakingRef.current = true
              setIsAgentSpeaking(true)

              // Clean up finished nodes from tracking array
              sourceNode.onended = () => {
                activeSourceNodesRef.current = activeSourceNodesRef.current.filter(n => n !== sourceNode)
                if (activeSourceNodesRef.current.length === 0) {
                  isAgentSpeakingRef.current = false
                  setIsAgentSpeaking(false)
                }
              }

              const now = audioContextRef.current.currentTime
              const startTime = Math.max(now, nextPlayTimeRef.current)
              sourceNode.start(startTime)
              nextPlayTimeRef.current = startTime + audioBuffer.duration
            }
          }

          // Handle server-side interrupt acknowledgment
          if (msg.type === 'interrupt' || msg.type === 'interrupted') {
            stopAgentAudio()
          }

          if (msg.type === 'transcript') {
            const role = msg.role === 'user' ? 'user' : 'agent'
            const text = msg.text || msg.transcript || ''
            if (text.trim()) {
              setTranscriptEntries(prev => [...prev, { role, text: text.trim(), timestamp: new Date().toISOString() }])
              if (role === 'agent') {
                setThinkingText('')
              }
            }
          }

          if (msg.type === 'thinking') {
            setThinkingText(msg.text || 'Thinking...')
          }

          if (msg.type === 'clear') {
            setThinkingText('')
          }

          if (msg.type === 'error') {
            setStatusMessage(msg.message || 'Voice agent error occurred.')
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onerror = () => {
        setStatusMessage('WebSocket connection error.')
      }

      ws.onclose = () => {
        if (callStatus !== 'ended') {
          setCallStatus('ended')
        }
      }
    } catch (err) {
      setCallStatus('idle')
      setStatusMessage('Failed to access microphone. Please check permissions.')
      setActiveAgentId(null)
    }
  }

  const endCall = () => {
    // Stop all playing audio nodes
    activeSourceNodesRef.current.forEach(node => {
      try { node.stop() } catch { /* already stopped */ }
      try { node.disconnect() } catch { /* already disconnected */ }
    })
    activeSourceNodesRef.current = []
    isAgentSpeakingRef.current = false
    setIsAgentSpeaking(false)
    setIsUserSpeaking(false)

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    nextPlayTimeRef.current = 0
    speechEnergyBufferRef.current = []
    lastInterruptTimeRef.current = 0
    setCallStatus('ended')
    setActiveAgentId(null)
  }

  const saveAndReset = () => {
    if (transcriptEntries.length > 0) {
      const messages: Message[] = transcriptEntries.map(entry => ({
        id: generateUUID(),
        role: entry.role,
        content: entry.role === 'user' ? `[Voice] ${entry.text}` : entry.text,
        timestamp: entry.timestamp,
      }))
      const conv: Conversation = {
        id: generateUUID(),
        channel: 'voice',
        messages,
        status: 'pending_triage',
        startedAt: messages[0]?.timestamp || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        sessionId: voiceSessionIdRef.current,
      }
      setConversations(prev => [conv, ...prev])
    }
    setCallStatus('idle')
    setTranscriptEntries([])
    setDuration(0)
    setStatusMessage('Voice call saved. Ready for triage in History.')
    setThinkingText('')
    setInterruptCount(0)
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-wide">Voice Support</h2>
          <p className="text-muted-foreground text-sm mt-1">Speak with the AI voice assistant</p>
        </div>
        {activeAgentId === VOICE_AGENT_ID && (
          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
            <div className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
            Voice Agent Active
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/30 shadow-sm">
          <CardContent className="p-8 flex flex-col items-center text-center">
            <div className={cn(
              'w-32 h-32 rounded-full flex items-center justify-center mb-6 transition-all duration-500 relative',
              callStatus === 'idle' ? 'bg-secondary' :
              callStatus === 'connecting' ? 'bg-amber-100' :
              callStatus === 'active' && isUserSpeaking ? 'bg-blue-100 shadow-lg shadow-blue-200/50' :
              callStatus === 'active' && isAgentSpeaking ? 'bg-green-100 shadow-lg shadow-green-200/50 ring-4 ring-green-300/30 ring-offset-2' :
              callStatus === 'active' ? 'bg-green-100 shadow-lg shadow-green-200/50' :
              'bg-red-100'
            )}>
              {callStatus === 'active' ? (
                <div className="relative">
                  <FiPhone className={cn('w-12 h-12', isUserSpeaking ? 'text-blue-600' : 'text-green-600')} />
                  {isAgentSpeaking && !isUserSpeaking && (
                    <>
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 animate-ping" />
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-[3px]">
                        <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                        <div className="w-1 h-4 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        <div className="w-1 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                        <div className="w-1 h-5 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '100ms' }} />
                        <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '250ms' }} />
                      </div>
                    </>
                  )}
                  {isUserSpeaking && (
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-[3px]">
                      <div className="w-1 h-3 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                      <div className="w-1 h-5 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '100ms' }} />
                      <div className="w-1 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                      <div className="w-1 h-4 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                      <div className="w-1 h-3 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '250ms' }} />
                    </div>
                  )}
                  {!isAgentSpeaking && !isUserSpeaking && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 animate-ping" />
                  )}
                </div>
              ) : callStatus === 'connecting' ? (
                <div className="animate-pulse">
                  <FiPhone className="w-12 h-12 text-amber-600" />
                </div>
              ) : callStatus === 'ended' ? (
                <FiPhoneOff className="w-12 h-12 text-red-500" />
              ) : (
                <FiPhone className="w-12 h-12 text-muted-foreground" />
              )}
            </div>

            <div className="mb-2 flex flex-col items-center gap-1.5">
              <Badge variant={callStatus === 'active' ? 'default' : 'outline'} className="text-sm px-3 py-1">
                {callStatus === 'idle' ? 'Ready' : callStatus === 'connecting' ? 'Connecting...' : callStatus === 'active' ? 'Call Active' : 'Call Ended'}
              </Badge>
              {callStatus === 'active' && (
                <div className="flex items-center gap-2">
                  {isAgentSpeaking && !isUserSpeaking && (
                    <span className="text-xs text-green-700 font-medium flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Agent Speaking
                    </span>
                  )}
                  {isUserSpeaking && (
                    <span className="text-xs text-blue-700 font-medium flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      Listening
                    </span>
                  )}
                  {!isAgentSpeaking && !isUserSpeaking && (
                    <span className="text-xs text-muted-foreground">Idle</span>
                  )}
                </div>
              )}
            </div>

            {callStatus === 'active' && (
              <p className="text-2xl font-mono font-semibold mb-4 text-foreground">{formatDuration(duration)}</p>
            )}

            {statusMessage && (
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg mb-4">{statusMessage}</p>
            )}

            <div className="flex items-center gap-4 mt-2">
              {callStatus === 'idle' && (
                <Button size="lg" onClick={startCall} className="gap-2 px-8">
                  <FiPhone className="w-5 h-5" />
                  Start Call
                </Button>
              )}
              {callStatus === 'connecting' && (
                <Button size="lg" disabled className="gap-2 px-8">
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Connecting...
                </Button>
              )}
              {callStatus === 'active' && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isMuted ? 'destructive' : 'outline'}
                          size="lg"
                          onClick={() => setIsMuted(!isMuted)}
                          className="gap-2"
                        >
                          {isMuted ? <FiMicOff className="w-5 h-5" /> : <FiMic className="w-5 h-5" />}
                          {isMuted ? 'Unmute' : 'Mute'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isMuted ? 'Click to unmute microphone' : 'Click to mute microphone'}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="destructive" size="lg" onClick={endCall} className="gap-2">
                    <FiPhoneOff className="w-5 h-5" />
                    End Call
                  </Button>
                </>
              )}
              {callStatus === 'ended' && (
                <div className="flex gap-3">
                  {transcriptEntries.length >= 2 && (
                    <Button variant="outline" onClick={() => {
                      const msgs: Message[] = transcriptEntries.map(entry => ({
                        id: generateUUID(),
                        role: entry.role,
                        content: entry.role === 'user' ? `[Voice] ${entry.text}` : entry.text,
                        timestamp: entry.timestamp,
                      }))
                      setTicketModalMessages(msgs)
                      setShowTicketModal(true)
                    }} className="gap-2 text-primary border-primary/30 hover:bg-primary/10">
                      <FiFileText className="w-4 h-4" />
                      Convert to Ticket
                    </Button>
                  )}
                  <Button onClick={saveAndReset} className="gap-2">
                    <FiCheck className="w-4 h-4" />
                    Save & Close
                  </Button>
                  <Button variant="outline" onClick={() => { setCallStatus('idle'); setTranscriptEntries([]); setDuration(0); setStatusMessage(''); setInterruptCount(0); }}>
                    Discard
                  </Button>
                </div>
              )}
            </div>

            {callStatus === 'active' && (
              <div className="mt-4 w-full max-w-xs">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50/80 border border-blue-200/50 text-xs text-blue-700">
                  <FiZap className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Barge-in enabled. Speak anytime to interrupt the agent.</span>
                </div>
                {interruptCount > 0 && (
                  <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                    {interruptCount} interruption{interruptCount > 1 ? 's' : ''} during this call
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/30 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">Live Transcript</CardTitle>
            <CardDescription>
              {callStatus === 'active' ? 'Real-time speech-to-text' : callStatus === 'ended' ? 'Call transcript' : 'Transcript will appear here during the call'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[380px]">
              {transcriptEntries.length === 0 && callStatus !== 'active' ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <FiMic className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No transcript yet. Start a call to begin.</p>
                </div>
              ) : (
                <div className="space-y-3 pr-3">
                  {transcriptEntries.map((entry, idx) => (
                    <div key={idx} className={cn('flex', entry.role === 'user' ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[85%] rounded-xl px-3 py-2', entry.role === 'user' ? 'bg-primary/10 text-foreground' : 'bg-secondary text-secondary-foreground')}>
                        <p className="text-xs font-medium mb-1 text-muted-foreground">
                          {entry.role === 'user' ? 'Customer' : 'Agent'}
                        </p>
                        <div className="text-sm leading-relaxed">{entry.role === 'agent' ? renderMarkdown(entry.text) : entry.text}</div>
                        <p className="text-[10px] text-muted-foreground mt-1.5">{formatTimestamp(entry.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                  {thinkingText && (
                    <div className="flex justify-start">
                      <div className="bg-secondary/50 rounded-xl px-3 py-2 max-w-[85%]">
                        <p className="text-xs text-muted-foreground italic animate-pulse">{thinkingText}</p>
                      </div>
                    </div>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <ConvertToTicketModal
        open={showTicketModal}
        onClose={() => {
          setShowTicketModal(false)
          setTicketModalMessages([])
        }}
        messages={ticketModalMessages}
        channel="voice"
        onTicketCreated={(ticket, conv) => {
          setTickets(prev => [ticket, ...prev])
          setConversations(prev => [conv, ...prev])
          setCallStatus('idle')
          setTranscriptEntries([])
          setDuration(0)
          setStatusMessage('Ticket created from voice call. View in Tickets.')
          setThinkingText('')
        }}
      />
    </div>
  )
}

// ============================================================
// HISTORY SCREEN
// ============================================================
function HistoryScreen({
  conversations,
  setConversations,
  tickets,
  setTickets,
  activeAgentId,
  setActiveAgentId,
  userId,
}: {
  conversations: Conversation[]
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  tickets: Ticket[]
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
  userId: string
}) {
  const [channelFilter, setChannelFilter] = useState<'all' | 'chat' | 'voice'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_triage' | 'triaged' | 'escalated'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [triagingId, setTriagingId] = useState<string | null>(null)
  const [triageStatus, setTriageStatus] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = conversations.filter(c => {
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const hasMatch = Array.isArray(c.messages) && c.messages.some(m => (m.content || '').toLowerCase().includes(q))
      if (!hasMatch) return false
    }
    return true
  })

  const triageConversation = async (conv: Conversation) => {
    setTriagingId(conv.id)
    setActiveAgentId(TRIAGE_AGENT_ID)
    setTriageStatus(prev => ({ ...prev, [conv.id]: 'Triaging...' }))

    try {
      const transcript = Array.isArray(conv.messages)
        ? conv.messages.map(m => `${m.role === 'user' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n')
        : ''

      const result = await callAIAgent(
        `Triage the following customer support conversation transcript:\n\n${transcript}`,
        TRIAGE_AGENT_ID,
        { user_id: userId }
      )

      if (result.success) {
        const data = parseAgentResponse(result)
        const triageResult: TriageResult = {
          ticket_subject: data?.ticket_subject || 'Support Ticket',
          priority: data?.priority || 'Medium',
          category: data?.category || 'general',
          issue_summary: data?.issue_summary || '',
          resolution_status: data?.resolution_status || 'unresolved',
          escalation_needed: data?.escalation_needed || false,
          escalation_reason: data?.escalation_reason || '',
          recommended_actions: data?.recommended_actions || '',
          ticket_created: data?.ticket_created || false,
          hubspot_ticket_id: data?.hubspot_ticket_id || '',
        }

        const newStatus = triageResult.escalation_needed ? 'escalated' : 'triaged'

        setConversations(prev => prev.map(c =>
          c.id === conv.id ? { ...c, status: newStatus as Conversation['status'], triageResult } : c
        ))

        const newTicket: Ticket = {
          id: triageResult.hubspot_ticket_id || generateUUID().slice(0, 8),
          conversationId: conv.id,
          subject: triageResult.ticket_subject,
          priority: triageResult.priority,
          category: triageResult.category,
          summary: triageResult.issue_summary,
          status: triageResult.resolution_status,
          escalated: triageResult.escalation_needed,
          escalationReason: triageResult.escalation_reason,
          recommendedActions: triageResult.recommended_actions,
          hubspotTicketId: triageResult.hubspot_ticket_id,
          createdAt: new Date().toISOString(),
        }
        setTickets(prev => [newTicket, ...prev])

        setTriageStatus(prev => ({ ...prev, [conv.id]: triageResult.escalation_needed ? 'Escalated! Ticket created.' : 'Triaged successfully. Ticket created.' }))
      } else {
        setTriageStatus(prev => ({ ...prev, [conv.id]: 'Triage failed. Please try again.' }))
      }
    } catch {
      setTriageStatus(prev => ({ ...prev, [conv.id]: 'Network error during triage.' }))
    } finally {
      setTriagingId(null)
      setActiveAgentId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-wide">Conversation History</h2>
          <p className="text-muted-foreground text-sm mt-1">{conversations.length} total conversations</p>
        </div>
        {activeAgentId === TRIAGE_AGENT_ID && (
          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">
            <div className="w-2 h-2 rounded-full bg-blue-500 mr-1.5 animate-pulse" />
            Triage Agent Active
          </Badge>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
        <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as typeof channelFilter)}>
          <SelectTrigger className="w-[140px] bg-background">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="chat">Chat</SelectItem>
            <SelectItem value="voice">Voice</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending_triage">Pending Triage</SelectItem>
            <SelectItem value="triaged">Triaged</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-border/30 shadow-sm">
          <CardContent className="py-12 text-center">
            <FiClock className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No conversations found matching your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(conv => {
            const isExpanded = expandedId === conv.id
            const firstMsg = Array.isArray(conv.messages) && conv.messages.length > 0 ? conv.messages[0] : null
            return (
              <Card key={conv.id} className="border-border/30 shadow-sm overflow-hidden">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : conv.id)}
                >
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0', conv.channel === 'chat' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600')}>
                    {conv.channel === 'chat' ? <FiMessageSquare className="w-4 h-4" /> : <FiPhone className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {firstMsg?.content?.slice(0, 70) ?? 'Conversation'}
                      {(firstMsg?.content?.length ?? 0) > 70 ? '...' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {conv.channel === 'chat' ? 'Chat' : 'Voice'} &middot; {formatDate(conv.startedAt)} at {formatTimestamp(conv.startedAt)} &middot; {Array.isArray(conv.messages) ? conv.messages.length : 0} messages
                    </p>
                  </div>
                  <Badge variant="outline" className={cn('text-xs border flex-shrink-0', getStatusColor(conv.status))}>
                    {getStatusLabel(conv.status)}
                  </Badge>
                  {isExpanded ? <FiChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <FiChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </div>

                {isExpanded && (
                  <div className="border-t border-border/30">
                    <div className="p-4 bg-secondary/20">
                      <h4 className="text-sm font-medium mb-3">Transcript</h4>
                      <ScrollArea className="max-h-64">
                        <div className="space-y-2 pr-2">
                          {Array.isArray(conv.messages) && conv.messages.map(msg => (
                            <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                              <div className={cn('max-w-[80%] rounded-lg px-3 py-2 text-sm', msg.role === 'user' ? 'bg-primary/10' : 'bg-card')}>
                                <p className="text-xs font-medium text-muted-foreground mb-0.5">{msg.role === 'user' ? 'Customer' : 'Agent'} &middot; {formatTimestamp(msg.timestamp)}</p>
                                <div className="leading-relaxed">{renderMarkdown(msg.content)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    {conv.triageResult && (
                      <div className="p-4 bg-blue-50/50 border-t border-border/30">
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <FiTag className="w-4 h-4" />
                          Triage Result
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Subject</p>
                            <p className="text-sm font-medium">{conv.triageResult.ticket_subject}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Priority</p>
                            <Badge className={cn('text-xs mt-0.5', getPriorityColor(conv.triageResult.priority))}>
                              {conv.triageResult.priority}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Category</p>
                            <Badge variant="outline" className="text-xs mt-0.5">{conv.triageResult.category}</Badge>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Resolution</p>
                            <Badge variant="outline" className={cn('text-xs mt-0.5 border', getStatusColor(conv.triageResult.resolution_status))}>
                              {getStatusLabel(conv.triageResult.resolution_status)}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Escalated</p>
                            <p className="text-sm font-medium">{conv.triageResult.escalation_needed ? 'Yes' : 'No'}</p>
                          </div>
                          {conv.triageResult.hubspot_ticket_id && (
                            <div>
                              <p className="text-xs text-muted-foreground">HubSpot ID</p>
                              <p className="text-sm font-medium font-mono">{conv.triageResult.hubspot_ticket_id}</p>
                            </div>
                          )}
                        </div>
                        {conv.triageResult.issue_summary && (
                          <div className="mb-2">
                            <p className="text-xs text-muted-foreground mb-1">Summary</p>
                            <p className="text-sm">{conv.triageResult.issue_summary}</p>
                          </div>
                        )}
                        {conv.triageResult.escalation_reason && (
                          <div className="mb-2">
                            <p className="text-xs text-muted-foreground mb-1">Escalation Reason</p>
                            <p className="text-sm text-red-700">{conv.triageResult.escalation_reason}</p>
                          </div>
                        )}
                        {conv.triageResult.recommended_actions && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Recommended Actions</p>
                            <div className="text-sm">{renderMarkdown(conv.triageResult.recommended_actions)}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {triagingId === conv.id && (
                      <div className="p-4 border-t border-border/30">
                        <OrchestrationPanel agentType="triage" />
                      </div>
                    )}

                    {conv.status === 'pending_triage' && (
                      <div className="p-4 border-t border-border/30 flex items-center justify-between gap-3">
                        <div className="flex-1">
                          {triageStatus[conv.id] && (
                            <p className={cn('text-xs', triageStatus[conv.id]?.includes('failed') || triageStatus[conv.id]?.includes('error') ? 'text-red-600' : 'text-green-700')}>
                              {triageStatus[conv.id]}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); triageConversation(conv) }}
                          disabled={triagingId === conv.id}
                          className="gap-2"
                        >
                          {triagingId === conv.id ? (
                            <>
                              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                              Triaging...
                            </>
                          ) : (
                            <>
                              <FiTag className="w-4 h-4" />
                              Triage & Escalate
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// TICKETS SCREEN
// ============================================================
function TicketsScreen({
  tickets,
  conversations,
}: {
  tickets: Ticket[]
  conversations: Conversation[]
}) {
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

  const filtered = tickets.filter(t => {
    if (priorityFilter !== 'all' && t.priority?.toLowerCase() !== priorityFilter) return false
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    return true
  })

  const categories = [...new Set(tickets.map(t => t.category).filter(Boolean))]
  const linkedConversation = selectedTicket ? conversations.find(c => c.id === selectedTicket.conversationId) : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold tracking-wide">Ticket Management</h2>
        <p className="text-muted-foreground text-sm mt-1">{tickets.length} total tickets</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px] bg-background">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="unresolved">Unresolved</SelectItem>
            <SelectItem value="partially_resolved">Partially Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-border/30 shadow-sm">
          <CardContent className="py-12 text-center">
            <FiTag className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No tickets found. Triage conversations to create tickets.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/30 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Ticket ID</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Subject</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Priority</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Category</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Created</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(ticket => (
                <TableRow
                  key={ticket.id}
                  className="cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <TableCell className="font-mono text-xs">{ticket.hubspotTicketId || ticket.id.slice(0, 8)}</TableCell>
                  <TableCell className="text-sm font-medium max-w-[250px] truncate">{ticket.subject}</TableCell>
                  <TableCell>
                    <Badge className={cn('text-xs', getPriorityColor(ticket.priority))}>{ticket.priority}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{ticket.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs border', getStatusColor(ticket.status))}>
                      {getStatusLabel(ticket.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(ticket.createdAt)}</TableCell>
                  <TableCell>
                    <FiChevronRight className="w-4 h-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{selectedTicket?.subject}</DialogTitle>
            <DialogDescription className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs">{selectedTicket?.hubspotTicketId || selectedTicket?.id?.slice(0, 8)}</span>
              <span>&middot;</span>
              <span>{selectedTicket?.createdAt ? formatDate(selectedTicket.createdAt) : ''}</span>
            </DialogDescription>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-5 mt-2">
              <div className="flex flex-wrap gap-2">
                <Badge className={cn('text-xs', getPriorityColor(selectedTicket.priority))}>{selectedTicket.priority} Priority</Badge>
                <Badge variant="outline" className="text-xs">{selectedTicket.category}</Badge>
                <Badge variant="outline" className={cn('text-xs border', getStatusColor(selectedTicket.status))}>
                  {getStatusLabel(selectedTicket.status)}
                </Badge>
                {selectedTicket.escalated && (
                  <Badge variant="destructive" className="text-xs">
                    <FiAlertTriangle className="w-3 h-3 mr-1" />
                    Escalated
                  </Badge>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-semibold mb-2">Issue Summary</h4>
                <div className="text-sm text-foreground/80 bg-secondary/30 rounded-lg p-3">
                  {renderMarkdown(selectedTicket.summary)}
                </div>
              </div>

              {selectedTicket.escalationReason && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-red-700">Escalation Reason</h4>
                  <p className="text-sm bg-red-50 rounded-lg p-3 text-red-800">{selectedTicket.escalationReason}</p>
                </div>
              )}

              {selectedTicket.recommendedActions && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Recommended Actions</h4>
                  <div className="text-sm bg-blue-50 rounded-lg p-3">
                    {renderMarkdown(selectedTicket.recommendedActions)}
                  </div>
                </div>
              )}

              {linkedConversation && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Linked Transcript</h4>
                  <ScrollArea className="h-48 border rounded-lg">
                    <div className="p-3 space-y-2">
                      {Array.isArray(linkedConversation.messages) && linkedConversation.messages.map(msg => (
                        <div key={msg.id} className="text-sm">
                          <span className="font-medium text-muted-foreground">{msg.role === 'user' ? 'Customer' : 'Agent'}:</span>{' '}
                          <span>{msg.content}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {selectedTicket.hubspotTicketId && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/30 rounded-lg p-3">
                  <FiExternalLink className="w-4 h-4" />
                  <span>HubSpot Ticket: <span className="font-mono font-medium">{selectedTicket.hubspotTicketId}</span></span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// KNOWLEDGE BASE SCREEN
// ============================================================
function KnowledgeBaseScreen() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold tracking-wide">Knowledge Base Management</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Upload SOPs, FAQs, product documentation, and policy documents to enhance the AI support agents.
        </p>
      </div>

      <Card className="border-border/30 shadow-sm">
        <CardHeader>
          <CardTitle className="font-serif text-lg">Document Library</CardTitle>
          <CardDescription>
            The knowledge base powers both Chat and Voice support agents. Upload banking documents in PDF, DOCX, or TXT format.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KnowledgeBaseUpload ragId={RAG_ID} />
        </CardContent>
      </Card>

      <Card className="border-border/30 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 text-primary flex-shrink-0">
              <FiUpload className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-1">Recommended Documents</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2"><FiChevronRight className="w-3 h-3 flex-shrink-0" /> Standard Operating Procedures (SOPs)</li>
                <li className="flex items-center gap-2"><FiChevronRight className="w-3 h-3 flex-shrink-0" /> Product FAQs and feature guides</li>
                <li className="flex items-center gap-2"><FiChevronRight className="w-3 h-3 flex-shrink-0" /> Account onboarding instructions</li>
                <li className="flex items-center gap-2"><FiChevronRight className="w-3 h-3 flex-shrink-0" /> Login and password reset procedures</li>
                <li className="flex items-center gap-2"><FiChevronRight className="w-3 h-3 flex-shrink-0" /> Escalation policies and matrices</li>
                <li className="flex items-center gap-2"><FiChevronRight className="w-3 h-3 flex-shrink-0" /> Compliance and regulatory documents</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================
export default function Page() {
  const [activeScreen, setActiveScreen] = useState<NavScreen>('dashboard')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [sampleDataOn, setSampleDataOn] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [userId] = useState(() => getOrCreateUserId())

  // Handle sample data toggle
  useEffect(() => {
    if (sampleDataOn) {
      const sampleConvs = generateSampleConversations()
      setConversations(sampleConvs)
      setTickets(generateSampleTickets(sampleConvs))
    } else {
      setConversations([])
      setTickets([])
    }
  }, [sampleDataOn])

  const activeChats = conversations.filter(c => c.channel === 'chat' && c.status === 'active').length
  const activeCalls = conversations.filter(c => c.channel === 'voice' && c.status === 'active').length
  const openTickets = tickets.filter(t => t.status !== 'resolved').length

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground flex">
        <SidebarNav
          activeScreen={activeScreen}
          onNavigate={setActiveScreen}
          activeChats={activeChats}
          activeCalls={activeCalls}
          openTickets={openTickets}
        />

        <div className="flex-1 flex flex-col min-h-screen">
          {/* Top Header */}
          <header className="h-16 border-b border-border/30 bg-card px-6 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="font-serif text-lg font-semibold tracking-wide text-primary">HDFC Bank</h2>
              <Separator orientation="vertical" className="h-6" />
              <span className="text-sm text-muted-foreground">L1 Customer Support Platform</span>
            </div>
            <div className="flex items-center gap-4">
              <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer">Sample Data</Label>
              <Switch
                id="sample-toggle"
                checked={sampleDataOn}
                onCheckedChange={setSampleDataOn}
              />
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto p-6">
            {activeScreen === 'dashboard' && (
              <DashboardScreen
                conversations={conversations}
                tickets={tickets}
                onNavigate={setActiveScreen}
              />
            )}
            {activeScreen === 'chat' && (
              <ChatScreen
                conversations={conversations}
                setConversations={setConversations}
                tickets={tickets}
                setTickets={setTickets}
                onNavigate={setActiveScreen}
                activeAgentId={activeAgentId}
                setActiveAgentId={setActiveAgentId}
                userId={userId}
              />
            )}
            {activeScreen === 'voice' && (
              <VoiceScreen
                conversations={conversations}
                setConversations={setConversations}
                tickets={tickets}
                setTickets={setTickets}
                activeAgentId={activeAgentId}
                setActiveAgentId={setActiveAgentId}
                userId={userId}
              />
            )}
            {activeScreen === 'history' && (
              <HistoryScreen
                conversations={conversations}
                setConversations={setConversations}
                tickets={tickets}
                setTickets={setTickets}
                activeAgentId={activeAgentId}
                setActiveAgentId={setActiveAgentId}
                userId={userId}
              />
            )}
            {activeScreen === 'tickets' && (
              <TicketsScreen
                tickets={tickets}
                conversations={conversations}
              />
            )}
            {activeScreen === 'knowledge' && (
              <KnowledgeBaseScreen />
            )}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  )
}
