import { definePlugin } from '@polis/react';
import FeedbackWidget from './FeedbackWidget';

/**
 * The frontend plugin definition for Feedback.
 *
 * Mirrors the backend plugin `key` ("feedback") and registers the widget as the
 * `feedback-widget` component so the polis-react plugin renderer can drop it
 * into a customizable space. The manifest (../../plugin.json) maps this to
 * `frontend[0] = { bundle, space: "app-shell", component: "feedback-widget" }`.
 *
 * Capability mapping (per polis-react #99):
 *   backend bindings  →  frontend `components`  →  { "feedback-widget": FeedbackWidget }
 */
export default definePlugin({
  key: 'feedback',
  name: 'Feedback',
  version: '0.1.0',
  components: {
    'feedback-widget': FeedbackWidget,
  },
});
