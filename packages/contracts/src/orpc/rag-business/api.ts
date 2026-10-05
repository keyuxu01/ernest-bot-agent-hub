import { oc } from '@orpc/contract';
import { RagBusinessGreetingResponseSchema } from '../../rag-business/greeting';

/**
 * @description Contract for retrieving the RAG business-service greeting.
 */
const RagBusinessGreetingContract = oc
  .route({
    method: 'GET',
    path: '/api/greeting',
    summary: 'Get the service greeting',
    tags: ['Greeting'],
  })
  .output(RagBusinessGreetingResponseSchema);

/**
 * @description Contract router for the RAG business API.
 */
const RagBusinessApiContract = {
  greeting: RagBusinessGreetingContract,
};

export { RagBusinessApiContract, RagBusinessGreetingContract };
