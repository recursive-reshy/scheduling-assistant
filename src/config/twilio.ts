import twilio from 'twilio'

const client = twilio( process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN! )

export const sendWhatsappMessage = async ( to: string, message: string ) => {
  try {
    await client.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER!,
      to,
      body: message
    })
    
  } catch (error) {
    console.error(`Error sending WhatsApp message to ${to}: ${error}`);
    throw error
  }
}

export default client