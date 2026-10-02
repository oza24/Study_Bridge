import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";
import { PollyClient, SynthesizeSpeechCommand, VoiceId, LanguageCode } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function POST(req: Request) {
  try {
    // ── Read env vars ─────────────────────────────────────────────────────────
    const region      = process.env.REGION || process.env.AWS_REGION || "us-east-1";
    const bucketName  = process.env.AUDIO_BUCKET_NAME || "eduvoice-audio-vilas-2026";
    const tableName   = process.env.DYNAMODB_TABLE    || "EduVoice_Sessions";
    const groqApiKey  = process.env.GROQ_API_KEY      || "";

    // Amplify strips env vars with "ACCESS_KEY" in the name at runtime.
    // Workaround: store credentials as a JSON string in STUDIO_CREDS_JSON.
    // Value to set in Amplify console: {"accessKeyId":"AKIA...","secretAccessKey":"..."}
    let explicitCreds: { accessKeyId: string; secretAccessKey: string } | undefined;
    if (process.env.STUDIO_CREDS_JSON) {
      try {
        explicitCreds = JSON.parse(process.env.STUDIO_CREDS_JSON);
        console.log("[CREDS] Loaded from STUDIO_CREDS_JSON, keyFirst4:", explicitCreds?.accessKeyId?.substring(0, 4));
      } catch {
        console.warn("[CREDS] Failed to parse STUDIO_CREDS_JSON");
      }
    } else {
      console.log("[CREDS] STUDIO_CREDS_JSON not set — using IAM role");
    }

    // Debug log — visible in Amplify → Monitoring → Hosting compute logs
    console.log("[ENV DEBUG]", {
      region,
      groqKeyFirst4:    groqApiKey.substring(0, 4) || "(empty)",
      hasExplicitCreds: !!explicitCreds?.accessKeyId,
      bucketName,
      tableName,
    });

    if (!groqApiKey) {
      return NextResponse.json(
        { error: "Missing GROQ_API_KEY. Add it in Amplify Console → App settings → Environment variables.", name: "ConfigError" },
        { status: 500 }
      );
    }

    const { text, targetLang } = await req.json();
    if (!text || !targetLang) {
      return NextResponse.json({ error: "Missing text or targetLang", name: "ValidationError" }, { status: 400 });
    }

    // ── Groq: text simplification & flashcards ────────────────────────────────
    const groq  = new Groq({ apiKey: groqApiKey });
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    const prompt = `You are a helpful study assistant. Simplify the following technical text for a student.
    Text: "${text}"
    Target Language: ${targetLang}
    Please provide all text in ${targetLang}, except for the fact that you MUST return valid JSON.

    Return a JSON object with strictly this structure:
    {
      "simplifiedExplanation": "A clear, conceptual explanation of the text",
      "audioScript": "A short, engaging summary of the explanation under 80 words for text-to-speech",
      "flashcards": [
        { "q": "Question 1", "a": "Answer 1", "hint": "Hint 1" },
        { "q": "Question 2", "a": "Answer 2", "hint": "Hint 2" }
      ]
    }`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const completionOutput = completion.choices[0]?.message?.content;
    if (!completionOutput) throw new Error("No response from Groq");
    console.log(`[GROQ] Successfully used model: ${model}`);

    const processedData = JSON.parse(completionOutput);

    // ── AWS services via IAM Service Role (default credential chain) ──────────
    // Amplify auto-injects credentials for the attached IAM service role.
    // Ensure the role has: AmazonPollyFullAccess, AmazonS3FullAccess, AmazonDynamoDBFullAccess.
    let audioUrl  = "";
    const sessionId = `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const audioKey  = `audio/${sessionId}.mp3`;

    try {
      const awsConfig: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = { region };
      if (explicitCreds?.accessKeyId && explicitCreds?.secretAccessKey) {
        awsConfig.credentials = explicitCreds;
      }

      const pollyClient = new PollyClient(awsConfig);
      const s3Client    = new S3Client(awsConfig);
      const ddbClient   = new DynamoDBClient(awsConfig);

      // Polly TTS
      let voiceId: VoiceId     = VoiceId.Ruth;
      let langCode: LanguageCode = LanguageCode.en_US;
      const langLower = targetLang.toLowerCase();
      if (langLower.includes("hindi") || langLower.includes("hi")) {
        voiceId  = VoiceId.Kajal;
        langCode = LanguageCode.hi_IN;
      } else if (langLower.includes("spanish") || langLower.includes("es")) {
        voiceId  = VoiceId.Lucia;
        langCode = LanguageCode.es_ES;
      }

      const pollyResponse = await pollyClient.send(
        new SynthesizeSpeechCommand({
          Engine: "neural",
          LanguageCode: langCode,
          OutputFormat: "mp3",
          Text: processedData.audioScript,
          VoiceId: voiceId,
        })
      );

      // S3 upload
      if (pollyResponse.AudioStream) {
        const chunks: Uint8Array[] = [];
        for await (const chunk of pollyResponse.AudioStream as any) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        await s3Client.send(
          new PutObjectCommand({ Bucket: bucketName, Key: audioKey, Body: buffer, ContentType: "audio/mpeg" })
        );

        audioUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: bucketName, Key: audioKey }),
          { expiresIn: 3600 }
        );
      }

      // DynamoDB log
      await ddbClient.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            sessionId: { S: sessionId },
            timestamp: { S: new Date().toISOString() },
            targetLang: { S: targetLang },
            audioKey:   { S: audioKey },
            status:     { S: "SUCCESS" },
          },
        })
      );

      console.log("[AWS] ✅ Polly + S3 + DynamoDB completed successfully.");
    } catch (awsErr: any) {
      // Non-fatal: return Groq results even if AWS fails
      console.error("[AWS] ❌ Services failed:", awsErr?.message || awsErr);
      audioUrl = "";
    }

    return NextResponse.json({ sessionId, audioUrl, ...processedData });

  } catch (error: any) {
    console.error("[PIPELINE ERROR]", error);
    return NextResponse.json(
      { error: error.message || "Failed to process", name: error.name || "UnknownError" },
      { status: 500 }
    );
  }
}