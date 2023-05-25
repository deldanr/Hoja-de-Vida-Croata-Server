const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const Joi = require("joi");
const fs = require('fs');
const { Configuration, OpenAIApi } = require("openai");
const rateLimit = require("express-rate-limit");
const app = express();

require("dotenv").config();
app.use(cors());
app.use(bodyParser.json());

// Proteccion de los endpoint
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200 // limita cada IP a 100 solicitudes por ventana
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
        sexo: Joi.string().valid("Hombre", "Mujer"),
        edad: Joi.number().allow(''),
      })
    ),
  academicos: Joi.array()
    .items(
      Joi.object({
        institucion: Joi.string().required(),
        nombreCarrera: Joi.string().required(),
        anoInicio: Joi.date().required(),
        anoFin: Joi.date(),
        logros: Joi.string().required(),
      })
    ),
  cesante: Joi.boolean(),
  nombreEmpresa: Joi.string(),
  lugarTrabajo: Joi.string(),
  cargo: Joi.string(),
  descTrabajo: Joi.string(),
  logrosLaborales: Joi.string(),
  aporte: Joi.string(),
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
      nombrePadre: Joi.string(),
      nombreMadre: Joi.string(),
      fechaFallecimiento: Joi.date().required(),
      lugarFallecimiento: Joi.string().required(),
      anoEmigracion: Joi.number().required(),
      ciudadEmigro: Joi.string().required(),
      paisEmigro: Joi.string().required(),
      motivoEmigracion: Joi.string().required(),
      ocupacionDestino: Joi.string().required(),
      seCaso: Joi.boolean(),
      pareja: Joi.object({
        nombreConyuge: Joi.string().required(),
        anoCasamiento: Joi.number().required(),
      }),
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
Actua como un experto en trámites de ciudadania que además es experto en html.
Debes crear una Hoja de Vida para la solicitud de ciudadania Croata de una persona.
Los datos son:
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
      prompt += `Se casó con: ${antepasadoCroata.pareja.nombreConyuge} el año ${antepasadoCroata.pareja.anoCasamiento}\n`;
    }
    prompt += `Año de emigración: ${antepasadoCroata.anoEmigracion}\n`;
    prompt += `Lugar de nacimiento: ${antepasadoCroata.lugarNacimiento}\n`;
    prompt += `Fecha de nacimiento: ${antepasadoCroata.fechaNacimiento}\n`;
    prompt += `Motivo emigración: ${antepasadoCroata.motivoEmigracion}\n`;
    prompt += `En ${antepasadoCroata.paisEmigro} se dedicó a: ${antepasadoCroata.ocupacionDestino}\n`;
    prompt += `Fecha de defunción: ${antepasadoCroata.fechaFallecimiento} en ${antepasadoCroata.lugarFallecimiento}\n`;

  }
  prompt += `\nInterés en Obtener Ciudadania Croata: \n${interesCroatas}\n`;

  prompt += `\nAhora te indicare el formato de la Hoja de Vida que debes realizar:\n
  En primer lugar el titulo será "Hoja de Vida", debe ir centrado.
  Debajo del titulo sólo el nombre completo de la persona, pero más pequeño y centrado.
  Luego escribir un parrafo con un resumen de los antecedentes personales de la persona, aquí incorporarás los datos de los hijos (si es que hay) pero no incluiras datos de otras secciones. Escribir máximo 200 palabras, texto justificado. No poner la palabra resumen.
  Luego una sección llamada Antecedentes Personales donde pondrás esos datos en formato lista, alineado a la izquierda y en dos columnas.
  Luego una sección llamada Antecedentes Académicos. Debes darle formato como tabla.
  Luego una sección llamada Antecedentes Laborales. Aquí escribirás un parrafo con los datos entregados, sólo si los hay. Texto justificado.
  Luego una sección llamada Familiares Croatas. Debes darle formato como tabla y usar los datos entregados.
  Luego una sección llamada Antepasado Croata. Debes escribir en máximo dos parrafos y con un total de 300 palabras los datos del antepasado croata.
  Puedes ser creativo en la sección Antepasado Croata, con tal de poder alcanzar más palabras. El texto debe ir justificado.
  Finalmente, una sección llamada Motivación por la Ciudadania Croata: Esta sección debe ser uno a dos parrafos y en esta sección puedes ser creativo para ampliar el contenido del texto.
  
  Consideraciones generales que debes considerar:
  1. Todos los titulos deben ir en negrita.
  2. Todo el texto debe ir justificado.
  3. El contenido debe ser formateado en código HTML.
  4. Las tablas deben ser estilizadas con uso de CSS.
  5. Todos los parrafos deben ser en primera persona.
  6. Todos los datos entregados deben ser utilizados, no debes omitir nada ni tampoco repetir ideas.`;

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
      max_tokens: 2000,
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

      const data = {
        timestamp: new Date(),
        prompt: prompt[0],
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

// Endpoint para traducir al idioma croata.

app.post("/api/traducir", limiter, async (req, res, next) => {
  // Validar los datos

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
