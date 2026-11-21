import type { RTMClient } from 'agora-rtm';

export interface AgoraTokenData {
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
}

export interface LearnerSetupInput {
  learner_name: string;
  title: string;
  kind: 'code' | 'aptitude';
  language: string;
}

export interface ClientStartRequest extends Partial<LearnerSetupInput> {
  requester_id: string;
  channel_name: string;
  resume?: boolean;
}

export interface StopConversationRequest {
  agent_id: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
}

export interface AgoraRenewalTokens {
  rtcToken: string;
  rtmToken: string;
}

export interface ConversationComponentProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  setup: LearnerSetupInput;
  surface: 'app' | 'extension';
  agent_enabled: boolean;
  agent_toggling: boolean;
  on_toggle_agent: () => void;
  onTokenWillExpire: (uid: string) => Promise<AgoraRenewalTokens>;
  onEndConversation: () => void;
}
