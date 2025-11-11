import { Twilio } from 'twilio'

const twilio = new Twilio( process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN! )

export const sendWhatsappMessage = async ( to: string, message: string ) => {
  try {
    await twilio.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER!,
      to,
      body: message
    })
    
  } catch (error) {
    console.error(`Error sending WhatsApp message to ${to}: ${error}`);
    throw error
  }
}

export default twilio