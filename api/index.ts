import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';

const server = express();

let cachedApp: any;

async function bootstrap() {
  if (!cachedApp) {
    const app = await NestFactory.create<NestExpressApplication>(
      AppModule,
      new ExpressAdapter(server),
    );

    app.enableCors();

    try {
      app.useStaticAssets(join(process.cwd(), 'public'));
    } catch (e) {
      console.warn('Could not register static assets path:', e);
    }

    const config = new DocumentBuilder()
      .setTitle('Mister Minit API')
      .setDescription('The Mister Minit API description')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    await app.init();
    cachedApp = server;
  }
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await bootstrap();
    return app(req, res);
  } catch (error: any) {
    console.error('Serverless Function Invocation Error:', error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: error?.message || 'Serverless function failed to initialize.',
      envCheck: {
        hasMongoUri: !!process.env.MONGO_URI,
        hasOpenAiKey: !!process.env.OPENAI_API_KEY,
      },
    });
  }
}

