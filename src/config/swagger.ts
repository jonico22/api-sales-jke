import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import swaggerJSDoc from 'swagger-jsdoc';
import { envs } from '@/config/envs';

// 1. Creamos el registro de modelos
export const registry = new OpenAPIRegistry();

// 2. Configuración base de Swagger JSDoc
const swaggerOptions: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'JKE Solutions - API de Ventas',
      version: '1.0.0',
      description: 'Documentación automática generada desde esquemas Zod.',
    },
    servers: [{ url: `http://localhost:${envs.PORT}/api` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
  apis: ['./src/routes/*.ts'], 
};

// Combinamos JSDoc con los modelos de Zod
export const getSafeSwaggerDoc = () => {
  const spec = swaggerJSDoc(swaggerOptions) as any;
  const generator = new OpenApiGeneratorV3(registry.definitions);
  const components = generator.generateComponents();
  
  // Inyectamos los modelos generados por Zod en la definición de Swagger
  spec.components.schemas = { 
    ...spec.components.schemas, 
    ...(components.components?.schemas || {}) 
  };
  return spec;
};