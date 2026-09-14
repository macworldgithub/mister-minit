const { NestFactory } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');
const express = require('express');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const path = require('path');

const server = express();
let cachedServer;

async function bootstrap() {
  if (!cachedServer) {
    let AppModule;
    try {
      AppModule = require('../dist/app.module').AppModule;
    } catch (e) {
      if (
        e.code === 'MODULE_NOT_FOUND' &&
        (e.message.includes('../dist/app.module') || e.message.includes("Cannot find module '../dist/app.module'"))
      ) {
        AppModule = require('../dist/src/app.module').AppModule;
      } else {
        throw e;
      }
    }
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server));

    app.enableCors();

    try {
      app.useStaticAssets(path.join(process.cwd(), 'public'));
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
    cachedServer = server;
  }
  return cachedServer;
}

module.exports = async (req, res) => {
  try {
    const app = await bootstrap();
    return app(req, res);
  } catch (error) {
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
};
