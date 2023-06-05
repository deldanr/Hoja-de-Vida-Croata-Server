const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const Joi = require("joi");
const fs = require('fs');
const { Configuration, OpenAIApi } = require("openai");
const rateLimit = require("express-rate-limit");
const app = express();
const nodemailer = require('nodemailer');

require("dotenv").config();
app.use(cors());
app.use(bodyParser.json());

// Proteccion de los endpoint
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500 // limita cada IP a 100 solicitudes por ventana
});

//Verificador de los datos de entrada del formulario
const formularioSchema = Joi.object({
  creatividad: Joi.number().required(),
  nombreCompleto: Joi.string().required(),
  fechaNacimiento: Joi.date().required(),
  lugarNacimiento: Joi.string().required(),
  edad: Joi.number().required(),
  domicilio: Joi.string().required(),
  pais: Joi.string().required(),
  ocupacion: Joi.string().required(),
  estadoCivil: Joi.string().required(),
  telefono: Joi.number().required(),
  correoElectronico: Joi.string().email().required(),
  sinhijos: Joi.boolean(),
  hijos: Joi.array()
    .items(
      Joi.object({
        nombre: Joi.string().allow(''),
        sexo: Joi.string().valid("Hombre", "Mujer").allow(''),
        edad: Joi.number().allow(''),
      })
    ),
  academicos: Joi.array()
    .items(
      Joi.object({
        institucion: Joi.string().required(),
        nombreCarrera: Joi.string().required(),
        anoInicio: Joi.date().required(),
        anoFin: Joi.date().allow(''),
        enCurso: Joi.boolean(),
        logros: Joi.string().required(),
      })
    ),
  cesante: Joi.boolean(),
  nombreEmpresa: Joi.string().allow(''),
  lugarTrabajo: Joi.string().allow(''),
  cargo: Joi.string().allow(''),
  descTrabajo: Joi.string().allow(''),
  logrosLaborales: Joi.string().allow(''),
  aporte: Joi.string().allow(''),
  familiaresCroatas: Joi.array()
    .items(
      Joi.object({
        nombreCompleto: Joi.string().required(),
        parentesco: Joi.string().required(),
      })
    ),
    antepasadoCroata: Joi.object({
      nombre: Joi.string().required(),
      parentesco: Joi.string().required(),
      fechaNacimientoA: Joi.date().required(),
      lugarNacimientoA: Joi.string().required(),
      nombrePadre: Joi.string().allow(''),
      nombreMadre: Joi.string().allow(''),
      fechaFallecimiento: Joi.date().required(),
      lugarFallecimiento: Joi.string().required(),
      anoEmigracion: Joi.number().required(),
      ciudadEmigro: Joi.string().required(),
      paisEmigro: Joi.string().required(),
      motivoEmigracion: Joi.string().required(),
      ocupacionDestino: Joi.string().required(),
      seCaso: Joi.boolean(),
      nombreConyuge: Joi.string().allow(''),
      anoCasamiento: Joi.number().allow(''),
    }),
  interesCroatas: Joi.string().required(),
});

// Funcion que compila el prompt para la API de openAI
function createPrompt(formData) {
  const {
    creatividad,
    nombreCompleto,
    fechaNacimiento,
    lugarNacimiento,
    edad,
    domicilio,
    pais,
    ocupacion,
    estadoCivil,
    telefono,
    correoElectronico,
    sinhijos,
    hijos,
    academicos,
    cesante,
    nombreEmpresa,
    lugarTrabajo,
    cargo,
    descTrabajo,
    logrosLaborales,
    aporte,
    familiaresCroatas,
    interesCroatas,
    antepasadoCroata, // Campos del antepasado croata
  } = formData;

  let prompt = `
Actua como un experto en trámites de ciudadania.
Debes consolidar información que será utilizada para crear una hoja de vida.
Los datos que vas a utilizar son los siguientes:
    Nombre Completo: ${nombreCompleto}
    Fecha de Nacimiento: ${fechaNacimiento}
    Lugar de Nacimiento: ${lugarNacimiento}
    Edad: ${edad}
    Domicilio: ${domicilio}
    País: ${pais}
    Ocupación/Profesión: ${ocupacion}
    Estado Civil: ${estadoCivil}
    Teléfono: ${telefono}
    Correo Electrónico: ${correoElectronico}`;
  if (!sinhijos) {
    const hijosInfo = hijos
      .map(
        (hijo) =>
          `Nombre: ${hijo.nombre}, Sexo: ${hijo.sexo}, Edad: ${hijo.edad}\n`
      )
    prompt += `\nHijos: \n${hijosInfo}`;
  }
  if (academicos.length > 0) {
    const academicosInfo = academicos
      .map(
        (academico) =>
          `Institución: ${academico.institucion}, Nombre Carrera: ${academico.nombreCarrera}, Fecha desde: ${academico.anoInicio},Fecha hasta: ${academico.anoFin ? academico.anoFin : 'actualmente en curso'}, Logros: ${academico.logros}`
      )
    prompt += `Datos Académicos:\n ${academicosInfo}`;
  }
  if (cesante){
    prompt += `Actualmente cesante`;
  } else {
  prompt += `\nInformación Laboral:
    Nombre Empresa: ${nombreEmpresa}
    Lugar Trabajo: ${lugarTrabajo}
    Cargo: ${cargo}
    Funciones: ${descTrabajo}
    Logros Laborales: ${logrosLaborales}
    Aporte a Croacia: ${aporte}`;
  }

  if (familiaresCroatas.length > 0) {
    const familiaresCroatasInfo = familiaresCroatas
      .map(
        (familiarCroata) =>
          `Nombre Completo: ${familiarCroata.nombreCompleto}, Parentesco: ${familiarCroata.parentesco}\n`
      )
    prompt += `\nFamiliares con Ciudadania Croata: \n${familiaresCroatasInfo}`;
  }

  // Agregamos la información del antepasado croata
  if (antepasadoCroata) {
    prompt += `\nAntepasado Croata:\n`;
  
    prompt += `Nombre Completo: ${antepasadoCroata.nombre}\n`;
    prompt += `Parentesco: ${antepasadoCroata.parentesco}\n`;
    if (antepasadoCroata.nombrePadre || antepasadoCroata.nombreMadre){
    prompt += `Hijo de: ${antepasadoCroata.nombrePadre} y ${antepasadoCroata.nombreMadre}\n`;
    }
    if (antepasadoCroata.seCaso) {
      prompt += `Se casó con: ${antepasadoCroata.nombreConyuge} el año ${antepasadoCroata.anoCasamiento}\n`;
    }
    prompt += `Año de emigración: ${antepasadoCroata.anoEmigracion}\n`;
    prompt += `Lugar de nacimiento: ${antepasadoCroata.lugarNacimientoA}\n`;
    prompt += `Fecha de nacimiento: ${antepasadoCroata.fechaNacimientoA}\n`;
    prompt += `Motivo emigración: ${antepasadoCroata.motivoEmigracion}\n`;
    prompt += `En ${antepasadoCroata.paisEmigro} se dedicó a: ${antepasadoCroata.ocupacionDestino}\n`;
    prompt += `Fecha de defunción: ${antepasadoCroata.fechaFallecimiento} en ${antepasadoCroata.lugarFallecimiento}\n`;

  }
  prompt += `\nInterés en Obtener Ciudadania Croata: \n${interesCroatas}\n`;

  prompt += `\nLa información que debes redactar es la siguiente:\n
  1. Debes crear un resumen de los antecedentes personales de la persona. Aqui incorporarás los datos de los hijos (si es que hay). No incluiras nada de otras secciones. Máximo 200 palabras, no usar la palabra resumen.
  2. Debes escribir un parrafo donde pondrás los datos de los antecedentes laborales, sólo si los hay.
  3. Debes escribir un parrafo escribir máximo dos parrafos y con un total de 300 palabras los antecedentes del antepasado croata. Escribir como una historia, en primera persona.
  4. Debes escribir de uno a dos parrafos comentando la motivación para obtener la ciudadania croata.

  Consideración: Los parrafos deben ser escritos en primera persona.

  Formato de la entrega:
  Debes entregar todo en un formato tipo json con los siguientes elementos: "Presentacion, Laboral, Antepasado, Motivacion".`;

  return [prompt,Number(creatividad)];
}

// Aquí llamados a la API de openAI y le entregamos el prompt y temperature enviado desde el front.
async function callOpenAI([promptContent, promptCreativity]) {

  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  try {
    console.log("...Ejecutando llamada a OpenAI...");
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: promptContent,
        },
      ],
      temperature: promptCreativity,
      max_tokens: 2500,
    });

    return response;
  } catch (err) {
    // Maneja los errores de la API de OpenAI
    console.error("Error al llamar a OpenAI:", err.message);
    throw err;
  }
}

// Funcion para llamar a la API para traducir la respuesta anterior
async function callOpenAI2(prompt) {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  try {
    console.log("...Ejecutando llamada a OpenAI para traducir...");

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: "Eres un ciudadano nativo de Croacia que se dedica a traducir textos. Además eres experto en HTML.",
          role: "system",
          content: "Traducir todo el texto dentro del siguiente código al idioma Croata. Conservar todas las etiquetas en HTML: \n" + prompt,
        },
      ],
      temperature: 0.4, // Esta vez bajamos la creatividad al traducir.
      max_tokens: 2500,
    });

    return response;
  } catch (err) {
    // Maneja los errores de la API de OpenAI
    console.error("Error al llamar a OpenAI:", err.message);
    throw err;
  }
}

// Endpoint para generar la hoja de vida con los datos del formulario
app.post("/api/hoja_espanol", limiter, async (req, res, next) => {
  // Validar los datos
  const { error } = formularioSchema.validate(req.body);
  if (error) {
    console.log(error.details);
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const prompt = createPrompt(req.body);
    const result = await callOpenAI(prompt);
   
    if (result.data.choices.length > 0) {
      const generatedText = result.data.choices[0].message.content;
      
      const final = JSON.parse(generatedText);
      
      const data = {
        timestamp: new Date(),
        prompt: prompt[0],
        Presentacion: generatedText,
      };

      // Guardar en un archivo JSON
      fs.appendFile('data.json', JSON.stringify(data) + '\n', 'utf8', (err) => {
        if (err) {
          console.error('Error al guardar los datos:', err);
        }
      });
      
      res.json(final);
    } else {
      res.json({ error: "La API de OpenAI devolvió una respuesta vacía" });
    }
  } catch (err) {
    next(err);
  }
});

// Endpoint para traducir al idioma croata.

app.post("/api/traducir", limiter, async (req, res, next) => {
  // Validar los datos
  console.log(req.body);
  try {
    const prompt = req.body.resultado;

    const result = await callOpenAI2(prompt);

    if (result.data.choices.length > 0) {
      const generatedText = result.data.choices[0].message.content;

      const data = {
        timestamp: new Date(),
        prompt: prompt,
        generatedText: generatedText
      };

      res.json({ result: generatedText });
    } else {
      res.json({ error: "La API de OpenAI devolvió una respuesta vacía" });
    }
  } catch (err) {
    next(err);
  }
});

// Endpoint para mostrar los prompt ejecutados, actualmente sin uso
/*app.get('/api/data', (req, res) => {
  fs.readFile('data.json', 'utf8', (err, data) => {
    if (err) {
      console.error('Error al leer el archivo:', err);
      return res.status(500).json({ error: 'Error al obtener los datos' });
    }

    try {
      const jsonData = data
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      res.json(jsonData);
    } catch (parseError) {
      console.error('Error al analizar el archivo JSON:', parseError);
      return res.status(500).json({ error: 'Error al analizar los datos' });
    }
  });
});*/

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'pagrodoconce@gmail.com',
    pass: process.env.MAILEE_PASS,
  },
});

app.post('/api/enviar-correo', (req, res) => {
  const { nombre, correo, mensaje } = req.body;

  const mailOptions = {
    from: 'pagrodoconce@gmail.com',
    to: 'pagrodoconce@gmail.com',
    subject: '[Croat-IA] Contacto Web',
    text: `
      Nombre: ${nombre}
      Correo: ${correo}
      Mensaje: ${mensaje}
    `,
  };

transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error al enviar el correo electrónico:', error);
      res.status(500).json({ error: 'Error al enviar el correo electrónico' });
    } else {
      console.log('Correo electrónico enviado:', info.response);
      res.json({ message: 'Correo electrónico enviado exitosamente' });
    }
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Ocurrió un error en el servidor" });
});

const port = process.env.PORT || 5000;

app.listen(port, () =>
  console.log(`******************************************
PUERTO: ${port}
******************************************`)
);
