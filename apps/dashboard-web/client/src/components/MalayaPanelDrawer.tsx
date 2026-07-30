import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ApiMalayaChartSpec, queryMalaya } from '@/lib/api';
import { MalayaChartView } from '@/pages/MalayaChat';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  chart: ApiMalayaChartSpec | null;
}

const SUGGESTED_PROMPTS = [
  "Today's revenue",
  'Biggest cost driver',
  'Compare branches',
  'Show revenue by hour',
];

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm Malaya. Ask me about today's revenue, losses, or how branches compare — grounded in your real data.",
  chart: null,
};

export function MalayaPanelDrawer() {
  const { user } = useAuth();
  // Same storage key as the dedicated Malaya AI page — this bubble and that
  // page share one saved log regardless of which one you ask from.
  const storageKey = user ? `malaya-chat-log-${user.id}` : null;

  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (!storageKey) return;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      } catch {
        // ignore corrupt saved log
      }
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    localStorage.setItem(storageKey, JSON.stringify(messages.slice(-100)));
  }, [messages, storageKey, hydrated]);

  const handleSend = async (question: string = input) => {
    if (!question.trim() || loading) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: question, chart: null }]);
    setInput('');
    setLoading(true);

    try {
      const response = await queryMalaya(question);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: response.answer, chart: response.chart },
      ]);
    } catch (error) {
      toast.error("Malaya couldn't answer that. Check your connection and try again.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg hover:shadow-xl active:scale-[0.97] transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] bg-primary text-white border-0 hover:bg-accent-hover"
          title="Malaya AI Assistant"
        >
          <Sparkles className="w-6 h-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-sm font-bold">
              M
            </div>
            <div>
              <SheetTitle className="font-corp-display">Malaya AI</SheetTitle>
              <p className="text-xs text-muted-foreground font-corp-body">Operations Assistant</p>
            </div>
          </div>
        </SheetHeader>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={message.role === 'user' ? 'max-w-xs' : 'max-w-full w-full'}>
                  <div
                    className={`px-4 py-2 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-none'
                        : 'bg-secondary text-foreground rounded-bl-none'
                    } font-corp-body text-sm`}
                  >
                    {message.content}
                  </div>
                  {message.chart && <MalayaChartView spec={message.chart} />}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-secondary text-foreground px-4 py-2 rounded-lg rounded-bl-none flex items-center gap-2 font-corp-body text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
          </div>
            <div ref={scrollAnchorRef} />
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                variant="outline"
                size="sm"
                onClick={() => handleSend(prompt)}
                className="text-xs font-corp-body h-8"
              >
                {prompt}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Ask Malaya..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) handleSend();
              }}
              disabled={loading}
              className="font-corp-body text-sm"
            />
            <Button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              size="icon"
              className="bg-primary hover:bg-accent-hover"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
