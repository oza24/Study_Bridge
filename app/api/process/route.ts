import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";
import { PollyClient, SynthesizeSpeechCommand, VoiceId, LanguageCode } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const region = process.env.REGION || "us-east-1";

// AWS SDK Setup using credentials if provided
const awsConfig = {
  region,
  ...(process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.ACCESS_KEY_ID!,
          secretAccessKey: process.env.SECRET_ACCESS_KEY!
        }
      }
    : {})
};

const pollyClient = new PollyClient(awsConfig);
const s3Client = new S3Client(awsConfig);
const ddbClient = new DynamoDBClient(awsConfig);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "fallback_key" });

export async function POST(req: Request) {
  try {
    const { text, targetLang } = await req.json();

    if (!text || !targetLang) {
      return NextResponse.json({ error: "Missing text or targetLang" }, { status: 400 });
    }

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

    // 1. Groq Call
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "openai/gpt-oss-20b",
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const completionOutput = completion.choices[0]?.message?.content;
    if (!completionOutput) throw new Error("No response from Groq");

    const processedData = JSON.parse(completionOutput);

    // 2. Polly Call
    let voiceId: VoiceId = VoiceId.Ruth;
    let langCode: LanguageCode = LanguageCode.en_US;
    if (targetLang.toLowerCase() === "hindi") {
      voiceId = VoiceId.Kajal;
      langCode = LanguageCode.hi_IN;
    } else if (targetLang.toLowerCase() === "spanish") {
      voiceId = VoiceId.Lucia;
      langCode = LanguageCode.es_US;
    }

    const pollyCommand = new SynthesizeSpeechCommand({
      Engine: "neural",
      LanguageCode: langCode,
      OutputFormat: "mp3",
      Text: processedData.audioScript,
      VoiceId: voiceId,
    });

    const pollyResponse = await pollyClient.send(pollyCommand);
    const audioStream = pollyResponse.AudioStream;
    let audioUrl = "";

    const sessionId = `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const audioKey = `audio/${sessionId}.mp3`;
    const bucketName = process.env.AUDIO_BUCKET_NAME || "eduvoice-audio";

    // 3. S3 Upload & Presigned URL
    if (audioStream) {
      const chunks = [];
      for await (const chunk of audioStream as any) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: audioKey,
          Body: buffer,
          ContentType: "audio/mpeg",
        })
      );

      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: audioKey,
      });

      audioUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
    }

    // 4. DynamoDB Insert
    const tableName = process.env.DYNAMODB_TABLE || "EduVoice_Sessions";
    await ddbClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          sessionId: { S: sessionId },
          timestamp: { S: new Date().toISOString() },
          targetLang: { S: targetLang },
          audioKey: { S: audioKey },
          status: { S: "SUCCESS" }
        }
      })
    );

    return NextResponse.json({
      sessionId,
      audioUrl,
      ...processedData,
    });

  } catch (error: any) {
    console.error("Pipeline Error:", error);
    // Return the actual error message to the UI for debugging
    return NextResponse.json(
      { 
        error: error.message || "Failed to process", 
        stack: error.stack || null,
        name: error.name || "UnknownError"
      }, 
      { status: 500 }
    );
  }
}
