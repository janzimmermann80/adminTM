import assert from 'node:assert/strict'
import { test } from 'node:test'
import nodemailer from 'nodemailer'
import { createPrejimkaMail, PREJIMKA_RECIPIENTS, reservePrejimkaSend, updatePrejimkaSend } from './prejimkaSend.js'

test('preserves recipient, subject and both CSV attachments', async () => {
  const mail = createPrejimkaMail(17, 'Firma', 'CZ123', 'wamm', 'GPS1-obsah', 'GPS2-obsah')
  assert.equal(mail.to, PREJIMKA_RECIPIENTS.wamm.email)
  assert.equal(mail.subject, 'TruckManager - gps1-0017.csv/gps2-0017.csv')
  assert.deepEqual(mail.attachments?.map(attachment => attachment.filename), ['gps1-0017.csv', 'gps2-0017.csv'])
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true })
  const result = await transport.sendMail(mail)
  const message = result.message.toString()
  assert.match(message, /gps1-0017\.csv/)
  assert.match(message, /gps2-0017\.csv/)
  assert.match(message, /Z3BzQHdhLW1tLmN6|gps@wa-mm\.cz/i)
})

test('allocates consecutive numbers and prevents duplicate request IDs', () => {
  process.env.PREJIMKA_DB_PATH = ':memory:'
  assert.equal(reservePrejimkaSend('first'), 1)
  assert.equal(reservePrejimkaSend('first'), null)
  updatePrejimkaSend('first', 'sent')
  assert.equal(reservePrejimkaSend('first'), null)
  assert.equal(reservePrejimkaSend('second'), 2)
})
