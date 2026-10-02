import { oc } from '@orpc/contract';
import { GreetingResponseSchema } from '../greeting';

/**
 * @description Contract for retrieving the business-service greeting through the typed API.
 */
const GreetingContract = oc
  .route({
    method: 'GET',
    path: '/api/greeting',
    summary: 'Get the service greeting',
    tags: ['Greeting'],
  })
  .output(GreetingResponseSchema);

/**
 * @description Contract router shared by business API servers and clients.
 */
const BusinessApiContract = {
  greeting: GreetingContract,
};

export { BusinessApiContract, GreetingContract };
