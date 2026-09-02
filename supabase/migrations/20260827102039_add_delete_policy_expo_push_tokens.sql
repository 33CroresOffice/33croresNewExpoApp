-- Add DELETE policy so users can remove their own push token (sign-out / push disabled)
CREATE POLICY "Users can delete own push token"
  ON expo_push_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
