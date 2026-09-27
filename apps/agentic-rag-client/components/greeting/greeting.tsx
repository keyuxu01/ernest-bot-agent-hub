'use client';

import {
  GREETING_ERROR_MESSAGE,
  GREETING_LOADING_MESSAGE,
} from '../../constants/greeting';
import { useGreeting } from '../../hooks/use-greeting';

/**
 * @description Render the pending, recoverable error or validated success state of the greeting query.
 */
const Greeting = () => {
  const greetingQuery = useGreeting();

  if (greetingQuery.isPending) {
    return <span role="status">{GREETING_LOADING_MESSAGE}</span>;
  }

  if (greetingQuery.isError) {
    return <span role="alert">{GREETING_ERROR_MESSAGE}</span>;
  }

  return <span>{greetingQuery.data.message}</span>;
};

export { Greeting };
