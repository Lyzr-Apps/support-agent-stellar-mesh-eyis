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
import { FiMessageSquare, FiPhone, FiHome, FiClock, FiTag, FiUpload, FiSend, FiMic, FiMicOff, FiPhoneOff, FiSearch, FiChevronRight, FiChevronDown, FiChevronUp, FiUser, FiHeadphones, FiAlertTriangle, FiCheck, FiX, FiExternalLink } from 'react-icons/fi'

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

// ============================================================
// HELPERS
// ============================================================

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
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
// CHAT SCREEN
// ============================================================
function ChatScreen({
  conversations,
  setConversations,
  onNavigate,
  activeAgentId,
  setActiveAgentId,
}: {
  conversations: Conversation[]
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  onNavigate: (screen: NavScreen) => void
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
}) {
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
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
      const result = await callAIAgent(inputValue.trim(), CHAT_AGENT_ID, { session_id: sessionId })

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
                  <div className={cn('max-w-[75%] rounded-2xl px-4 py-3', msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-secondary text-secondary-foreground rounded-bl-md')}>
                    <div className="text-sm leading-relaxed">{renderMarkdown(msg.content)}</div>
                    <div className={cn('flex items-center gap-2 mt-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                      <span className={cn('text-xs', msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                        {formatTimestamp(msg.timestamp)}
                      </span>
                      {msg.metadata?.issue_category && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-background/50 border-border/50">
                          {msg.metadata.issue_category}
                        </Badge>
                      )}
                      {msg.metadata?.escalation_needed && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                          Escalation
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3 max-w-[75%]">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" />
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-muted-foreground ml-1">Agent is typing...</span>
                    </div>
                  </div>
                </div>
              )}
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
    </div>
  )
}

// ============================================================
// VOICE SCREEN
// ============================================================
function VoiceScreen({
  conversations,
  setConversations,
  activeAgentId,
  setActiveAgentId,
}: {
  conversations: Conversation[]
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
}) {
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'active' | 'ended'>('idle')
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [transcriptEntries, setTranscriptEntries] = useState<{ role: 'user' | 'agent'; text: string; timestamp: string }[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [thinkingText, setThinkingText] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextPlayTimeRef = useRef(0)
  const isMutedRef = useRef(false)
  const sampleRateRef = useRef(24000)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

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

  const startCall = async () => {
    setCallStatus('connecting')
    setStatusMessage('Connecting to voice agent...')
    setActiveAgentId(VOICE_AGENT_ID)
    setTranscriptEntries([])
    setDuration(0)
    setThinkingText('')
    nextPlayTimeRef.current = 0

    try {
      const res = await fetch('https://voice-sip.studio.lyzr.ai/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: VOICE_AGENT_ID }),
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

              const now = audioContextRef.current.currentTime
              const startTime = Math.max(now, nextPlayTimeRef.current)
              sourceNode.start(startTime)
              nextPlayTimeRef.current = startTime + audioBuffer.duration
            }
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
        sessionId: 'voice_' + generateUUID().slice(0, 8),
      }
      setConversations(prev => [conv, ...prev])
    }
    setCallStatus('idle')
    setTranscriptEntries([])
    setDuration(0)
    setStatusMessage('Voice call saved. Ready for triage in History.')
    setThinkingText('')
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
              'w-32 h-32 rounded-full flex items-center justify-center mb-6 transition-all duration-500',
              callStatus === 'idle' ? 'bg-secondary' :
              callStatus === 'connecting' ? 'bg-amber-100' :
              callStatus === 'active' ? 'bg-green-100 shadow-lg shadow-green-200/50' :
              'bg-red-100'
            )}>
              {callStatus === 'active' ? (
                <div className="relative">
                  <FiPhone className="w-12 h-12 text-green-600" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 animate-ping" />
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

            <div className="mb-2">
              <Badge variant={callStatus === 'active' ? 'default' : 'outline'} className="text-sm px-3 py-1">
                {callStatus === 'idle' ? 'Ready' : callStatus === 'connecting' ? 'Connecting...' : callStatus === 'active' ? 'Call Active' : 'Call Ended'}
              </Badge>
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
                  <Button onClick={saveAndReset} className="gap-2">
                    <FiCheck className="w-4 h-4" />
                    Save & Close
                  </Button>
                  <Button variant="outline" onClick={() => { setCallStatus('idle'); setTranscriptEntries([]); setDuration(0); setStatusMessage(''); }}>
                    Discard
                  </Button>
                </div>
              )}
            </div>
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
                        <p className="text-xs font-medium mb-0.5 text-muted-foreground">
                          {entry.role === 'user' ? 'Customer' : 'Agent'}
                        </p>
                        <p className="text-sm leading-relaxed">{entry.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{formatTimestamp(entry.timestamp)}</p>
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
}: {
  conversations: Conversation[]
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  tickets: Ticket[]
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
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
        TRIAGE_AGENT_ID
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
                onNavigate={setActiveScreen}
                activeAgentId={activeAgentId}
                setActiveAgentId={setActiveAgentId}
              />
            )}
            {activeScreen === 'voice' && (
              <VoiceScreen
                conversations={conversations}
                setConversations={setConversations}
                activeAgentId={activeAgentId}
                setActiveAgentId={setActiveAgentId}
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
