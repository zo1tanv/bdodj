FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/bdodj-0.1.0.jar /app/bdodj.jar
ENV BDODJ_PREFIX=!
ENV BDODJ_ACTIVITY="BDO Radio"
CMD ["java", "-Xms64m", "-Xmx256m", "-jar", "/app/bdodj.jar"]
