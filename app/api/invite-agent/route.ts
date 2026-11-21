import { NextRequest, NextResponse } from "next/server";
import {
  AgoraClient,
  Agent,
  Area,
  DeepgramSTT,
  ExpiresIn,
  MurfTTS,
  OpenAI,
} from "agora-agents";
import { ClientStartRequest, AgentResponse } from "@/types/conversation";
import { DEFAULT_AGENT_UID } from "@/lib/agora";
import { coach_tools } from "@/lib/agent-tools";
import { clean_session, clean_setup, create_session } from "@/lib/coach";
import { build_greeting, build_prompt } from "@/lib/prompt";

const agentUid = String(DEFAULT_AGENT_UID);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function resolve_public_base_url(): string {
  const explicit = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const host = process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (host) return `https://${host}`;
  throw new Error("Missing required environment variable: PUBLIC_BASE_URL");
}

export async function POST(request: NextRequest) {
  try {
    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name } = body;

    if (!channel_name || !requester_id) {
      return NextResponse.json(
        { error: "channel_name and requester_id are required" },
        { status: 400 },
      );
    }

    const appId = requireEnv("NEXT_PUBLIC_AGORA_APP_ID");
    const appCertificate = requireEnv("NEXT_AGORA_APP_CERTIFICATE");
    const murf_key = requireEnv("MURF_API_KEY");
    const public_base_url = resolve_public_base_url();
    const tool_secret = requireEnv("TOOL_SECRET");
    const murf_voice_id = process.env.MURF_VOICE_ID || "Matthew";
    const murf_locale = process.env.MURF_LOCALE || "en-US";

    const session_key = clean_session(channel_name);
    if (!session_key) {
      return NextResponse.json({ error: "channel_name is not valid" }, { status: 400 });
    }
    const setup = clean_setup(body);
    const resume = body.resume === true;
    await create_session(session_key, setup, resume);
    const greeting = build_greeting(setup, resume);
    const prompt = build_prompt(setup);

    const client = new AgoraClient({
      area: Area.AP,
      appId,
      appCertificate,
    });

    const agent = new Agent({
      client,
      instructions: prompt,
      greeting,
      failureMessage: "Hmm, give me one second.",
      maxHistory: 50,
      turnDetection: {
        config: {
          speech_threshold: 0.5,
          start_of_speech: {
            mode: "vad",
            vad_config: {
              interrupt_duration_ms: 160,
              prefix_padding_ms: 300,
            },
          },
          end_of_speech: {
            mode: "vad",
            vad_config: {
              silence_duration_ms: 640,
            },
          },
        },
      },
      advancedFeatures: { enable_rtm: true, enable_tools: true },
      parameters: {
        audio_scenario: "chorus",
        data_channel: "rtm",
        enable_error_message: true,
        enable_metrics: true,
      },
    })
      .withStt(
        new DeepgramSTT({
          model: "nova-3",
          language: "en",
        }),
      )
      .withLlm(
        new OpenAI({
          model: "gpt-4o-mini",
          greetingMessage: greeting,
          failureMessage: "Hmm, give me one second.",
          maxHistory: 30,
          params: {
            max_tokens: 512,
            temperature: 0.7,
            top_p: 0.95,
          },
          templateVariables: {
            tool_secret,
            session_key,
            learner_name: setup.learner_name,
            title: setup.title,
            kind: setup.kind,
            language: setup.language,
          },
          tools: coach_tools(public_base_url),
        }),
      )
      .withTts(
        new MurfTTS({
          key: murf_key,
          voiceId: murf_voice_id,
          baseUrl: "wss://global.api.murf.ai/v1/speech/stream-input",
          locale: murf_locale,
          rate: 0,
          pitch: 0,
          model: "FALCON",
          sampleRate: 24000,
        }),
      )
      .withTools(true);

    const session = agent.createSession({
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      idleTimeout: 300,
      expiresIn: ExpiresIn.hours(1),
      debug: false,
    });

    const agentId = await session.start();

    return NextResponse.json({
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: "RUNNING",
    } as AgentResponse);
  } catch (error) {
    console.error("Error starting conversation:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start conversation",
      },
      { status: 500 },
    );
  }
}
