import { Copy, Linkedin, Mail, MessageSquare } from 'lucide-react';
import { Card, Button } from '@app/components';

interface SharePanelProps {
  link: string;
  code: string;
  onCopyLink: () => void;
  onCopyCode: () => void;
  onShareLinkedIn: () => void;
  onShareEmail: () => void;
  onShareSMS: () => void;
}

export function SharePanel({ link, code, onCopyLink, onCopyCode, onShareLinkedIn, onShareEmail, onShareSMS }: SharePanelProps) {
  // SUB-06: detect link format — username (/yourusername) vs legacy (/r/code)
  const isUsernameFmt = link && !link.includes('/r/');

  return (
    <Card variant="default" padding="lg">
      <h3 className="text-sm font-semibold text-text mb-4">Share Your Referral</h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-text-faint block mb-1">
            {isUsernameFmt ? 'Your Personal Link' : 'Referral Link'}
          </label>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 px-3 py-2 text-xs bg-bg-elevated border border-border rounded-lg text-text font-mono"
              value={link}
              readOnly
            />
            <Button variant="secondary" size="sm" onClick={onCopyLink}>
              <Copy className="w-3.5 h-3.5 mr-1" strokeWidth={1.75} />Copy
            </Button>
          </div>
          {!isUsernameFmt && (
            <p className="text-[10px] text-text-faint mt-1">
              Set a username in Settings to get a personal link like brilliantjobs.app/yourname
            </p>
          )}
        </div>

        {!isUsernameFmt && (
          <div>
            <label className="text-xs text-text-faint block mb-1">Referral Code</label>
            <div className="flex items-center gap-2">
              <input
                className="w-32 px-3 py-2 text-xs bg-bg-elevated border border-border rounded-lg text-text font-mono text-center"
                value={code}
                readOnly
              />
              <Button variant="secondary" size="sm" onClick={onCopyCode}>
                <Copy className="w-3.5 h-3.5 mr-1" strokeWidth={1.75} />Copy
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onShareLinkedIn}>
            <Linkedin className="w-3.5 h-3.5 mr-1" strokeWidth={1.75} />LinkedIn
          </Button>
          <Button variant="secondary" size="sm" onClick={onShareEmail}>
            <Mail className="w-3.5 h-3.5 mr-1" strokeWidth={1.75} />Email
          </Button>
          <Button variant="secondary" size="sm" onClick={onShareSMS}>
            <MessageSquare className="w-3.5 h-3.5 mr-1" strokeWidth={1.75} />SMS
          </Button>
        </div>
      </div>
    </Card>
  );
}
