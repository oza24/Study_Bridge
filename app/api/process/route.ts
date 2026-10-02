import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";
import { PollyClient, SynthesizeSpeechCommand, VoiceId, LanguageCode } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function POST(req: Request) {
  try {
    const region = process.env.REGION || process.env.AWS_REGION || "us-east-1";
    const accessKeyId = process.env.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
    const bucketName = process.env.AUDIO_BUCKET_NAME || "eduvoice-audio-vilas-2026";
    const tableName = process.env.DYNAMODB_TABLE || "EduVoice_Sessions";
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!groqApiKey) {
      return NextResponse.json(
        { 
          error: "Missing GROQ_API_KEY. Please set GROQ_API_KEY in AWS Amplify Console under App Settings -> Environment Variables.",
          name: "ConfigError" 
        },
        { status: 500 }
      );
    }

    const { text, targetLang } = await req.json();

    if (!text || !targetLang) {
      return NextResponse.json({ error: "Missing text or targetLang", name: "ValidationError" }, { status: 400 });
    }

    // Build AWS Config. If explicit keys are provided, use them. Otherwise, let AWS SDK use the IAM Service Role / default credential chain.
    const awsConfig: any = { region };
    if (accessKeyId && secretAccessKey) {
      awsConfig.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }

    const pollyClient = new PollyClient(awsConfig);
    const s3Client = new S3Client(awsConfig);
    const ddbClient = new DynamoDBClient(awsConfig);
    const groq = new Groq({ apiKey: groqApiKey });

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

    const candidates = [process.env.GROQ_MODEL || "openai/gpt-oss-120b"]; // only keep openai model

    const modelsToTry = Array.from(new Set(candidates));

    let completion: any = null;
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        completion = await groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: model,
          temperature: 0.2,
          response_format: { type: "json_object" },
        });
        if (completion?.choices?.[0]?.message?.content) {
          console.log(`Successfully used Groq model: ${model}`);
          break;
        }
      } catch (err: any) {
        console.warn(`Groq model '${model}' failed:`, err?.message || err);
        lastError = err;
      }
    }

    if (!completion || !completion.choices?.[0]?.message?.content) {
      throw lastError || new Error("All Groq models failed");
    }

    const completionOutput = completion.choices[0].message.content;

    const processedData = JSON.parse(completionOutput);

    let voiceId: VoiceId = VoiceId.Ruth;
    let langCode: LanguageCode = LanguageCode.en_US;
    const langLower = targetLang.toLowerCase();
    
    if (langLower.includes("hindi") || langLower.includes("hi")) {
      voiceId = VoiceId.Kajal;
      langCode = LanguageCode.hi_IN;
    } else if (langLower.includes("spanish") || langLower.includes("es")) {
      voiceId = VoiceId.Lucia;
      langCode = LanguageCode.es_ES;
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

    if (audioStream) {
      const chunks: Uint8Array[] = [];
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

    await ddbClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          sessionId: { S: sessionId },
          timestamp: { S: new Date().toISOString() },
          targetLang: { S: targetLang },
          audioKey: { S: audioKey },
          status: { S: "SUCCESS" },
        },
      })
    );

    return NextResponse.json({
      sessionId,
      audioUrl,
      ...processedData,
    });

  } catch (error: any) {
    console.error("Pipeline Error:", error);
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