import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ClawPanel API',
      version: '1.0.0',
      description: 'API documentation for ClawPanel - Web management panel for OpenClaw',
      contact: {
        name: 'ClawPanel Team',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'API server',
      },
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User login, logout, token refresh',
      },
      {
        name: 'Agents',
        description: 'Agent management (CRUD operations)',
      },
      {
        name: 'MCP Servers',
        description: 'MCP server integration and tool sync',
      },
      {
        name: 'Tools',
        description: 'Tool management and assignment to agents',
      },
      {
        name: 'Files',
        description: 'File system operations',
      },
      {
        name: 'LLM',
        description: 'LLM providers and model management',
      },
      {
        name: 'Skills',
        description: 'OpenClaw skills and ClawHub integration',
      },
      {
        name: 'Chains',
        description: 'Workflow chain management',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

const specs = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  // Swagger page
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs));
  
  // Docs in JSON format
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
  
  console.log('📚 Swagger docs available at /api/docs');
}
